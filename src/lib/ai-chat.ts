// ============================================================================
// ai-chat.ts — Conversational AI assistant for scan analysis.
//
// Answers questions about a completed scan in natural language: explains
// findings, suggests exploitation/triage paths, compares severity, and gives
// remediation guidance. Uses a context-aware rule engine that reasons over the
// actual scan data (findings, CVEs, ports, TLS). Designed to be hot-swappable
// with a real LLM call when an API key (OpenAI/Anthropic) is provisioned.
// ============================================================================
import type { ScanResult, Finding, Severity } from "./types";

const SEV_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  ts: number;
}

function topFindings(scan: ScanResult, n = 5): Finding[] {
  return [...scan.findings]
    .filter((f) => f.severity !== "info")
    .sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// Intent detection — figure out what the user is asking.
// ---------------------------------------------------------------------------
type Intent =
  | "summary"
  | "critical"
  | "exploit"
  | "fix"
  | "explain_port"
  | "explain_cve"
  | "ssl"
  | "subdomains"
  | "score"
  | "compare"
  | "attack_surface"
  | "walkthrough"
  | "greeting"
  | "unknown";

function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  if (/^(hi|hello|hey|merhaba|selam)/i.test(s.trim())) return "greeting";
  if (/(summar|özet|brief|overview|genel|rapor)/i.test(s)) return "summary";
  if (/(most critical|worst|en kritik|en önemli|biggest risk|en büyük)/i.test(s)) return "critical";
  if (/(walkthrough|kill chain|yol harita|step.by.step|adım)/i.test(s)) return "walkthrough";
  if (/(exploit|sömür|attack|saldır|payload|poc|kullan)/i.test(s)) return "exploit";
  if (/(fix|remediat|çöz|düzelt|remedy|mitigat|patch)/i.test(s)) return "fix";
  if (/(\bport\b|\baçık\b|service|açık port)/i.test(s)) return "explain_port";
  if (/(cve|vuln|zafiyet|açık|vulnerabilit)/i.test(s)) return "explain_cve";
  if (/(ssl|tls|cert|sertifik|certificate)/i.test(s)) return "ssl";
  if (/(subdomain|alt alan|sub)/i.test(s)) return "subdomains";
  if (/(score|puan|risk score|notu)/i.test(s)) return "score";
  if (/(compare|karşılaş|diff|fark)/i.test(s)) return "compare";
  if (/(attack surface|saldırı yüzeyi|surface)/i.test(s)) return "attack_surface";
  if (/(walkthrough|adım|step|how do i|nasıl|kill chain|yol harita)/i.test(s)) return "walkthrough";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Answer generators
// ---------------------------------------------------------------------------
function aSummary(scan: ScanResult): string {
  const t = topFindings(scan, 4);
  const open = scan.ports.filter((p) => p.state === "open").length;
  const cves = scan.vulnerabilities.length;
  const lines = [
    `**${scan.meta.target}** — risk score **${scan.risk.score}/100 (grade ${scan.risk.grade})**.`,
    `I found ${scan.findings.length} findings across ${open} open ports${cves ? ` and matched ${cves} known CVEs` : ""}.`,
  ];
  if (t.length) {
    lines.push("The top issues are:");
    t.forEach((f, i) => lines.push(`${i + 1}. **[${f.severity.toUpperCase()}]** ${f.title}`));
  } else {
    lines.push("No critical or high findings — the host looks reasonably hardened.");
  }
  if (scan.risk.deductions.length > 5)
    lines.push("Ask me to *explain* or *prioritize* any of these, or for a remediation plan.");
  return lines.join("\n");
}

function aCritical(scan: ScanResult): string {
  const crit = scan.findings.filter((f) => f.severity === "critical" || f.severity === "high");
  if (!crit.length)
    return "Good news — there are **no critical or high-severity findings**. The most notable issues are medium/low. Want me to list them?";
  const sorted = crit.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  const top = sorted[0];
  return [
    `The most pressing issue is **${top.title}** (${top.severity}).`,
    top.description,
    "",
    `**Why it matters:** ${top.impact || "It increases your attack surface and exploitation risk."}`,
    `**Fix:** ${top.recommendation}`,
    "",
    sorted.length > 1 ? `There are ${sorted.length - 1} more high/critical findings. Ask me to prioritize them.` : "",
  ].join("\n");
}

function aExploit(scan: ScanResult): string {
  const exploitable = scan.vulnerabilities.filter((v) => v.exploit);
  if (exploitable.length) {
    const v = exploitable[0];
    return [
      `**${v.cve}** has a public exploit (CVSS ${v.cvss}). Here's how an attacker would approach it:`,
      "",
      `1. **Recon:** Confirm ${v.product}${v.version ? ` ${v.version}` : ""} is reachable${v.port ? ` on port ${v.port}` : ""}.`,
      `2. **Weaponize:** A public PoC exists for ${v.cve} — search Exploit-DB / Metasploit for "${v.title}".`,
      `3. **Execute:** ${v.description}`,
      `4. **Impact:** ${v.exploit ? "Unauthenticated remote code execution / data access is likely." : "Limited exploitation possible."}`,
      "",
      `⚠️ **Defense:** ${v.product} must be upgraded to a patched release immediately. This is actively exploitable.`,
    ].join("\n");
  }
  const risky = scan.ports.filter((p) => p.state === "open" && [3306, 5432, 6379, 27017, 9200, 2375, 3389, 23].includes(p.port));
  if (risky.length) {
    const p = risky[0];
    return [
      `Port **${p.port} (${p.service})** is the most exploitable surface.`,
      "",
      `For ${p.service}: an attacker would ${exploitPath(p.port)}`,
      `Since it's exposed to the internet, this is a high-value target for automated scanners.`,
      "",
      `**Fix:** ${p.service.includes("redis") || p.service.includes("mysql") ? "bind to localhost and require authentication." : "restrict via firewall / move behind a VPN."}`,
    ].join("\n");
  }
  return "I don't see an obviously exploitable CVE or exposed high-risk service. The findings are mostly misconfigurations. Want me to suggest hardening steps?";
}

function exploitPath(port: number): string {
  const map: Record<number, string> = {
    3306: "attempt default/weak MySQL credentials or exploit a version-specific auth bypass to dump the database.",
    5432: "try PostgreSQL default credentials or abuse trust authentication to read tables.",
    6379: "write an SSH authorized key or web shell to disk via unauthenticated Redis CONFIG SET (CRON/DIR).",
    27017: "connect to MongoDB without credentials and exfiltrate collections (often left auth-disabled).",
    9200: "exploit unauthenticated Elasticsearch — read indices or use dynamic scripts for RCE on old versions.",
    3389: "brute-force RDP credentials or exploit BlueKeep (CVE-2019-0708) on unpatched Windows.",
    23: "sniff cleartext Telnet credentials or brute-force login.",
    2375: "hit the unauthenticated Docker API to spawn a privileged container and escape to the host.",
  };
  return map[port] || "probe for known service weaknesses and default credentials.";
}

function aFix(scan: ScanResult): string {
  const fixes = topFindings(scan, 6)
    .filter((f) => f.recommendation)
    .map((f, i) => `${i + 1}. **${f.title}** (${f.severity}) → ${f.recommendation}`);
  if (!fixes.length) return "No urgent fixes are needed. Continue monitoring and keep components patched.";
  return [
    "Here's a prioritized remediation plan:",
    "",
    ...fixes,
    "",
    "Tackle critical and high items first — they have the biggest impact on your risk score.",
  ].join("\n");
}

function aPort(scan: ScanResult): string {
  const open = scan.ports.filter((p) => p.state === "open");
  if (!open.length) return "No open ports were detected on this target.";
  const lines = [`There are **${open.length} open ports**:`];
  open.slice(0, 12).forEach((p) => {
    lines.push(`• **${p.port}/${p.protocol}** — ${p.service}${p.product ? ` (${p.product}${p.version ? ` ${p.version}` : ""})` : ""}${p.cvss ? ` · est. CVSS ${p.cvss}` : ""}`);
  });
  const risky = open.filter((p) => [21, 23, 3306, 5432, 6379, 27017, 3389, 2375, 445].includes(p.port));
  if (risky.length) lines.push(`\n⚠️ ${risky.length} of these are high-risk services that shouldn't be internet-facing.`);
  return lines.join("\n");
}

function aCve(scan: ScanResult): string {
  if (!scan.vulnerabilities.length)
    return "No known CVEs were matched against the detected software. Either versions are patched or not enough version detail was extracted from banners.";
  const lines = [`I matched **${scan.vulnerabilities.length} CVE(s)** against the detected stack:`];
  [...scan.vulnerabilities]
    .sort((a, b) => b.cvss - a.cvss)
    .slice(0, 8)
    .forEach((v) => {
      lines.push(`• **${v.cve}** (CVSS ${v.cvss}, ${v.severity})${v.exploit ? " ⚡ exploit available" : ""} — ${v.title}`);
      lines.push(`  Affects: ${v.product}${v.version ? ` ${v.version}` : ""}`);
    });
  const expl = scan.vulnerabilities.filter((v) => v.exploit).length;
  if (expl) lines.push(`\n${expl} of these have public exploits — treat them as actively exploitable. Ask me "how to exploit" any of them.`);
  return lines.join("\n");
}

function aSsl(scan: ScanResult): string {
  const tls = scan.ssl[0];
  if (!tls) return "No TLS/SSL data was collected for this target (port 443 may not be open).";
  const lines = [
    `TLS analysis for **${tls.subjectCN}** — grade **${tls.grade}** (${tls.score}/100).`,
    `• Protocol: ${tls.tlsVersion}, cipher: ${tls.cipherName}`,
    `• Certificate: ${tls.selfSigned ? "self-signed ⚠️" : "valid & trusted"} · expires in ${tls.daysUntilExpiry} days`,
    `• Key: ${tls.keyBits || "?"}-bit ${tls.keyType} · signature: ${tls.signatureAlgorithm}`,
  ];
  if (tls.weakConfigs.length) {
    lines.push(`\n⚠️ Weaknesses found:`);
    tls.weakConfigs.forEach((w) => lines.push(`• ${w}`));
  } else {
    lines.push("\nNo TLS weaknesses detected — the configuration looks solid. ✓");
  }
  return lines.join("\n");
}

function aSubdomains(scan: ScanResult): string {
  if (!scan.subdomains.length) return "No subdomains were discovered (or subdomain enumeration wasn't selected).";
  const lines = [`Discovered **${scan.subdomains.length} subdomains** via passive OSINT + DNS brute-force.`];
  scan.subdomains.slice(0, 12).forEach((s) => lines.push(`• ${s.hostname} → ${s.ips[0] || "unresolved"}`));
  if (scan.subdomains.length > 12) lines.push(`…and ${scan.subdomains.length - 12} more.`);
  const internalish = scan.subdomains.filter((s) => /dev|staging|test|admin|internal|backup/.test(s.hostname));
  if (internalish.length) lines.push(`\n💡 ${internalish.length} look like dev/staging/internal hosts — prime targets for further testing.`);
  return lines.join("\n");
}

function aScore(scan: ScanResult): string {
  const lines = [
    `The risk score is **${scan.risk.score}/100 (grade ${scan.risk.grade} — ${scan.risk.label})**.`,
  ];
  if (scan.risk.deductions.length) {
    lines.push("Here's how it was calculated (each finding subtracts points):");
    scan.risk.deductions.slice(0, 6).forEach((d) => lines.push(`• ${d.reason} → **−${d.points}** (${d.severity})`));
    if (scan.risk.positives.length) {
      lines.push("\n**Positives (not penalized):**");
      scan.risk.positives.slice(0, 3).forEach((p) => lines.push(`• ${p}`));
    }
  } else {
    lines.push("No deductions were applied — the host is well hardened.");
  }
  return lines.join("\n");
}

function aWalkthrough(scan: ScanResult): string {
  const open = scan.ports.filter((p) => p.state === "open");
  const exploitable = scan.vulnerabilities.filter((v) => v.exploit);
  const lines = ["Here's a suggested kill-chain walkthrough for this target:", ""];
  lines.push("**1. Reconnaissance** (done):");
  lines.push(`   • ${scan.meta.ipAddresses.join(", ")} · ${scan.host.geo ? `${scan.host.geo.city}, ${scan.host.geo.country}` : "unknown geo"} · ${open.length} open ports`);
  if (scan.waf?.detected) lines.push(`   • ⚠️ ${scan.waf.name} WAF detected — evasion needed for web attacks.`);
  lines.push("");
  lines.push("**2. Enumeration:**");
  if (scan.web.discoveredPaths.length) lines.push(`   • ${scan.web.discoveredPaths.length} web paths discovered (check for admin/login).`);
  if (scan.subdomains.length) lines.push(`   • ${scan.subdomains.length} subdomains — pivot to less-secured ones.`);
  lines.push("");
  lines.push("**3. Exploitation (highest-value path):**");
  if (exploitable.length) {
    const v = exploitable[0];
    lines.push(`   • Use ${v.cve} public exploit against ${v.product}${v.port ? `:${v.port}` : ""}.`);
  } else if (open.some((p) => [3306, 6379, 27017, 9200].includes(p.port))) {
    lines.push(`   • Target the exposed database/cache service — often unauthenticated.`);
  } else {
    lines.push(`   • No obvious RCE vector — focus on web app logic, auth, or the ${scan.findings.filter((f) => f.severity !== "info").length} misconfigurations found.`);
  }
  lines.push("");
  lines.push("**4. Post-exploitation:** pivot internally, dump credentials, escalate privileges.");
  return lines.join("\n");
}

function aAttackSurface(scan: ScanResult): string {
  const as = scan.ai.attackSurface;
  const lines = [`Attack surface is **${as.level}** (score ${as.score}).`];
  lines.push("Contributing factors:");
  as.factors.forEach((f) => lines.push(`• ${f}`));
  return lines.join("\n");
}

function aUnknown(scan: ScanResult, q: string): string {
  const lower = q.toLowerCase();
  // Try to find a finding whose title/keywords match the question.
  const match = scan.findings.find((f) =>
    f.title.toLowerCase().split(/\W+/).some((w) => w.length > 3 && lower.includes(w)),
  );
  if (match) {
    return [
      `Regarding **${match.title}** (${match.severity}):`,
      match.description,
      "",
      `**Fix:** ${match.recommendation}`,
      match.evidence ? `**Evidence:** ${match.evidence}` : "",
    ].join("\n");
  }
  return [
    `I can help with this scan of **${scan.meta.target}**. Try asking me to:`,
    "• *summarize the findings*",
    "• *what's the most critical issue?*",
    "• *how would an attacker exploit this?*",
    "• *give me a remediation plan*",
    "• *explain the open ports / CVEs / TLS*",
    "• *show an attack walkthrough*",
    "",
    "Or ask about any specific finding by name.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
export function answerQuestion(scan: ScanResult, question: string): string {
  const intent = detectIntent(question);
  switch (intent) {
    case "greeting":
      return `Hello! I'm your Portinel AI assistant for **${scan.meta.target}**. I've analysed this scan (${scan.risk.score}/100, ${scan.findings.length} findings). What would you like to know?`;
    case "summary":
      return aSummary(scan);
    case "critical":
      return aCritical(scan);
    case "exploit":
      return aExploit(scan);
    case "fix":
      return aFix(scan);
    case "explain_port":
      return aPort(scan);
    case "explain_cve":
      return aCve(scan);
    case "ssl":
      return aSsl(scan);
    case "subdomains":
      return aSubdomains(scan);
    case "score":
      return aScore(scan);
    case "attack_surface":
      return aAttackSurface(scan);
    case "walkthrough":
      return aWalkthrough(scan);
    case "compare":
      return "To compare this scan with a previous one, open the scan detail page — Portinel automatically shows port/finding/risk diffs at the top.";
    default:
      return aUnknown(scan, question);
  }
}

// Suggested starter prompts for the UI.
export const SUGGESTED_PROMPTS = [
  "Summarize this scan",
  "What's the most critical issue?",
  "How would an attacker exploit this?",
  "Give me a remediation plan",
  "Explain the CVEs",
  "Show an attack walkthrough",
  "Explain the open ports",
  "How was the risk score calculated?",
];
