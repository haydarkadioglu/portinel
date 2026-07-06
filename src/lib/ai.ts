// ============================================================================
// ai.ts — Portinel intelligence engine.
//
// A deterministic, transparent analysis layer that turns raw probe data into
// the "AI" deliverables: overall risk score (with itemised deductions),
// prioritised risks, attack-surface estimate, executive & beginner summaries,
// and concrete remediation guidance. Deterministic-by-design so reports are
// reproducible and auditable — and trivially swappable for an LLM call.
// ============================================================================
import type {
  AiAnalysis,
  AttackSurface,
  Finding,
  Improvement,
  RawScanData,
  RiskAnalysis,
  ScanResult,
  Severity,
} from "./types";

const SEVERITY_POINTS: Record<Severity, number> = {
  critical: 22,
  high: 12,
  medium: 6,
  low: 2.5,
  info: 0,
};

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  info: "Informational",
};

export function sortBySeverity(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
  const c: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of findings) c[f.severity]++;
  return c;
}

// ---------------------------------------------------------------------------
// Risk score
// ---------------------------------------------------------------------------
function gradeFor(score: number): { grade: string; label: string } {
  if (score >= 90) return { grade: "A", label: "Excellent" };
  if (score >= 80) return { grade: "B", label: "Good" };
  if (score >= 70) return { grade: "C", label: "Fair" };
  if (score >= 55) return { grade: "D", label: "Poor" };
  return { grade: "F", label: "Critical" };
}

function computeRisk(data: RawScanData): RiskAnalysis {
  let score = 100;
  const deductions = data.findings
    .filter((f) => f.severity !== "info")
    .map((f) => ({
      reason: f.title,
      points: SEVERITY_POINTS[f.severity],
      severity: f.severity,
    }));
  for (const d of deductions) score -= d.points;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const positives: string[] = [];
  const primaryHttp =
    data.http.find((h) => h.scheme === "https") || data.http[0];
  if (primaryHttp?.securityHeaders["strict-transport-security"])
    positives.push("HSTS enabled — forces encrypted connections.");
  if (primaryHttp?.securityHeaders["content-security-policy"])
    positives.push("Content-Security-Policy present — mitigates XSS/injection.");
  if (primaryHttp?.securityHeaders["x-frame-options"])
    positives.push("X-Frame-Options set — clickjacking protection in place.");
  const tls = data.ssl[0];
  if (tls) {
    if (tls.tlsVersion === "TLSv1.2" || tls.tlsVersion === "TLSv1.3")
      positives.push(`Modern TLS negotiated (${tls.tlsVersion}).`);
    if (tls.isValid && !tls.selfSigned)
      positives.push("Valid, publicly-trusted TLS certificate.");
    if (tls.daysUntilExpiry >= 30)
      positives.push(
        `Certificate healthily valid for ${tls.daysUntilExpiry} more days.`,
      );
  }
  if (data.dns.length) {
    const txt = data.dns.find((r) => r.type === "TXT")?.values.join(" ") ?? "";
    if (/spf/i.test(txt)) positives.push("SPF record published (anti-spoofing).");
    if (/dmarc/i.test(txt)) positives.push("DMARC policy published.");
  }
  const riskyOpen = data.ports.filter(
    (p) => p.state === "open" && isRisky(p.port),
  ).length;
  if (riskyOpen === 0 && data.ports.length)
    positives.push("No high-risk administrative ports exposed.");

  const { grade, label } = gradeFor(score);
  return { score, grade, label, deductions, positives };
}

const RISKY = new Set([
  21, 23, 25, 110, 135, 139, 389, 445, 512, 513, 514, 873, 1433, 1521, 2049,
  2375, 2376, 3000, 3306, 3389, 5432, 5900, 6379, 8080, 8443, 9200, 9300,
  11211, 27017,
]);
function isRisky(port: number): boolean {
  return RISKY.has(port);
}

// ---------------------------------------------------------------------------
// Attack surface estimation
// ---------------------------------------------------------------------------
function computeAttackSurface(data: RawScanData): AttackSurface {
  const openPorts = data.ports.filter((p) => p.state === "open");
  const risky = openPorts.filter((p) => isRisky(p.port));
  const expired = data.ssl.some((s) => s.daysUntilExpiry < 0);
  const weakTls = data.ssl.some(
    (s) => s.tlsVersion === "TLSv1" || s.tlsVersion === "TLSv1.1",
  );
  const http = data.http[0];
  const missingHeaders = http
    ? Object.entries(http.securityHeaders).filter(([, v]) => !v).length
    : 0;

  let score =
    openPorts.length * 2.5 +
    risky.length * 9 +
    data.subdomains.length * 1.5 +
    data.technologies.length * 1.2 +
    data.findings.filter((f) => f.severity === "critical").length * 25 +
    data.findings.filter((f) => f.severity === "high").length * 10 +
    (expired ? 20 : 0) +
    (weakTls ? 12 : 0) +
    missingHeaders * 3 +
    data.vulnerabilities.filter((v) => v.exploit).length * 15 +
    data.vulnerabilities.length * 4 +
    (data.zoneTransfer.allowed ? 30 : 0);
  score = Math.round(score);

  let level = "Low";
  if (score >= 70) level = "Critical";
  else if (score >= 45) level = "High";
  else if (score >= 22) level = "Moderate";

  const factors: string[] = [];
  if (openPorts.length)
    factors.push(`${openPorts.length} open port(s) reachable externally`);
  if (risky.length) factors.push(`${risky.length} high-risk service(s) exposed`);
  if (data.subdomains.length)
    factors.push(`${data.subdomains.length} subdomain(s) discovered`);
  if (data.technologies.length)
    factors.push(`${data.technologies.length} technology/components fingerprinted`);
  if (expired) factors.push("At least one expired TLS certificate");
  if (weakTls) factors.push("Legacy TLS versions accepted");
  if (missingHeaders)
    factors.push(`${missingHeaders} missing security header(s)`);
  if (data.vulnerabilities.length)
    factors.push(
      `${data.vulnerabilities.length} known CVE(s) detected${data.vulnerabilities.some((v) => v.exploit) ? " (some with public exploits)" : ""}`,
    );
  if (data.zoneTransfer.allowed)
    factors.push("DNS zone transfer permitted (full zone leak)");
  if (factors.length === 0) factors.push("Minimal externally observable surface");

  return { score, level, factors };
}

// ---------------------------------------------------------------------------
// Improvements
// ---------------------------------------------------------------------------
function buildImprovements(data: RawScanData): Improvement[] {
  const seen = new Set<string>();
  const out: Improvement[] = [];
  for (const f of sortBySeverity(data.findings)) {
    if (f.severity === "info" || !f.recommendation) continue;
    const key = f.recommendation.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: f.title,
      detail: f.recommendation,
      severity: f.severity,
    });
    if (out.length >= 8) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------
function execSummary(data: RawScanData, risk: RiskAnalysis): string {
  const counts = countBySeverity(data.findings);
  const openPorts = data.ports.filter((p) => p.state === "open").length;
  const filtered = data.ports.filter((p) => p.state === "filtered").length;
  const ip = data.meta.ipAddresses[0] || "unknown";
  const geo = data.host.geo
    ? ` hosted in ${data.host.geo.city ? data.host.geo.city + ", " : ""}${data.host.geo.country}`
    : "";
  const parts: string[] = [];
  parts.push(
    `Reconnaissance of ${data.meta.target} (resolved to ${ip}${geo}) concluded with an overall security posture rated ${risk.grade} (${risk.score}/100 — ${risk.label}).`,
  );
  const riskParts: string[] = [];
  if (counts.critical) riskParts.push(`${counts.critical} critical`);
  if (counts.high) riskParts.push(`${counts.high} high`);
  if (counts.medium) riskParts.push(`${counts.medium} medium`);
  parts.push(
    `The assessment surfaced ${data.findings.length} finding(s)${
      riskParts.length ? ` (${riskParts.join(", ")})` : ""
    } across ${openPorts} open port(s)${filtered ? ` and ${filtered} filtered port(s)` : ""}.`,
  );
  if (data.vulnerabilities.length) {
    const exploitable = data.vulnerabilities.filter((v) => v.exploit).length;
    parts.push(
      `Intelligence matching identified ${data.vulnerabilities.length} known vulnerability (CVE)${exploitable ? `, ${exploitable} with publicly available exploits` : ""}.`,
    );
  }
  if (data.zoneTransfer.allowed)
    parts.push("A critical DNS misconfiguration permits unrestricted zone transfers.");
  const top = sortBySeverity(data.findings).find(
    (f) => f.severity === "critical" || f.severity === "high",
  );
  if (top)
    parts.push(
      `The most pressing exposure is "${top.title}" which should be remediated as a priority.`,
    );
  parts.push(
    risk.score >= 80
      ? "The host demonstrates generally sound hardening; address the remaining lower-severity items to further reduce residual risk."
      : "Immediate remediation is advised — prioritise the critical and high-severity findings listed below.",
  );
  return parts.join(" ");
}

function scanSummary(data: RawScanData): string {
  const lines: string[] = [];
  lines.push(
    `Target ${data.meta.target} classified as ${data.meta.targetType}; resolved to ${data.meta.ipAddresses.join(", ") || "no reachable address"}.`,
  );
  if (data.host.reverseDns.length)
    lines.push(`Reverse DNS: ${data.host.reverseDns.join(", ")}.`);
  const open = data.ports.filter((p) => p.state === "open");
  if (open.length)
    lines.push(
      `Open services: ${open
        .slice(0, 10)
        .map((p) => `${p.port}/${p.service}`)
        .join(", ")}${open.length > 10 ? ` (+${open.length - 10} more)` : ""}.`,
    );
  if (data.ssl[0])
    lines.push(
      `TLS: ${data.ssl[0].tlsVersion} via ${data.ssl[0].cipherName || "negotiated cipher"}, grade ${data.ssl[0].grade}.`,
    );
  if (data.technologies.length)
    lines.push(`Stack: ${data.technologies.slice(0, 10).join(", ")}.`);
  if (data.subdomains.length)
    lines.push(
      `Enumerated ${data.subdomains.length} subdomain(s): ${data.subdomains
        .slice(0, 6)
        .map((s) => s.hostname)
        .join(", ")}${data.subdomains.length > 6 ? "…" : ""}.`,
    );
  return lines.join(" ");
}

function beginnerExplanation(data: RawScanData, risk: RiskAnalysis): string {
  const openPorts = data.ports.filter((p) => p.state === "open").length;
  const risky = data.ports.filter((p) => p.state === "open" && isRisky(p.port));
  const tls = data.ssl[0];
  const bits: string[] = [];
  bits.push(
    `Think of ${data.meta.target} as a building. A security score of ${risk.score}/100 (grade ${risk.grade}) describes how well its "doors and windows" are locked.`,
  );
  if (openPorts)
    bits.push(
      `We found ${openPorts} open "doorways" (ports) that anyone on the internet can reach.`,
    );
  if (risky.length)
    bits.push(
      `${risky.length} of those are sensitive services (like databases or remote-desktop) that really should not be public — these are the equivalent of leaving a safe unlocked in the lobby.`,
    );
  if (tls)
    bits.push(
      tls.isValid && !tls.selfSigned
        ? "Its security certificate (the ID badge proving the site is genuine) is valid and trusted."
        : "Its security certificate has a problem — visitors' browsers may warn the connection isn't trustworthy.",
    );
  const missing = data.http[0]
    ? Object.entries(data.http[0].securityHeaders).filter(([, v]) => !v).length
    : 0;
  if (missing)
    bits.push(
      `The website is missing ${missing} recommended security settings that act like seatbelts for visitors' browsers.`,
    );
  bits.push(
    risk.score >= 80
      ? "Overall this target is reasonably well defended. The items below are suggestions to make it even safer."
      : "Overall there are meaningful weaknesses. Follow the prioritised steps below to lock things down.",
  );
  return bits.join(" ");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function analyze(data: RawScanData): Pick<ScanResult, "ai" | "risk"> {
  const risk = computeRisk(data);
  const attackSurface = computeAttackSurface(data);
  const openPorts = data.ports.filter((p) => p.state === "open").length;
  const keyMetrics = [
    { label: "Open ports", value: String(openPorts) },
    {
      label: "Findings",
      value: String(data.findings.filter((f) => f.severity !== "info").length),
    },
    { label: "Technologies", value: String(data.technologies.length) },
    { label: "Subdomains", value: String(data.subdomains.length) },
    {
      label: "CVEs",
      value: String(data.vulnerabilities.length),
    },
    {
      label: "Exploits",
      value: String(data.vulnerabilities.filter((v) => v.exploit).length),
    },
    {
      label: "TLS grade",
      value: data.ssl[0]?.grade ?? "—",
    },
    {
      label: "Geo",
      value: data.host.geo ? data.host.geo.countryCode : "—",
    },
  ];

  const ai: AiAnalysis = {
    executiveSummary: execSummary(data, risk),
    scanSummary: scanSummary(data),
    beginnerExplanation: beginnerExplanation(data, risk),
    attackSurface,
    prioritizedRisks: sortBySeverity(data.findings)
      .filter((f) => f.severity !== "info")
      .slice(0, 8),
    improvements: buildImprovements(data),
    keyMetrics,
  };

  return { ai, risk };
}

export { SEVERITY_LABEL };
