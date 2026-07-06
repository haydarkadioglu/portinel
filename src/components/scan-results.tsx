"use client";

import { useState } from "react";
import type { ScanRecord, Severity, Finding } from "@/lib/types";
import { Card, SectionTitle, SeverityBadge, MonoLabel } from "@/components/ui";
import { RiskGauge, PortHeatmap, NetworkGraph, FindingsDonut, BarChart, Timeline } from "@/components/charts";
import { AiChat } from "@/components/ai-chat";
import { cn, riskColor, SEVERITY_DOT, timeAgo } from "@/lib/utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "vulns", label: "CVEs" },
  { id: "ports", label: "Ports" },
  { id: "ssl", label: "TLS / SSL" },
  { id: "http", label: "HTTP" },
  { id: "web", label: "Web Recon" },
  { id: "dns", label: "DNS" },
  { id: "subdomains", label: "Subdomains" },
  { id: "security", label: "Security" },
  { id: "ai", label: "AI Report" },
];

export function ScanResults({ scan }: { scan: ScanRecord }) {
  const [tab, setTab] = useState("overview");
  const r = scan.results;

  if (!r) {
    return (
      <Card>
        <div className="py-10 text-center">
          <div className="mb-3 text-4xl">⚠️</div>
          <h3 className="text-lg font-semibold">Scan failed</h3>
          <p className="mt-1 text-sm text-muted">{scan.error || "No results available."}</p>
        </div>
      </Card>
    );
  }

  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of r.findings) counts[f.severity]++;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5 border-b border-line pb-px">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative px-3.5 py-2.5 text-sm font-medium transition",
              tab === t.id ? "text-brand" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {tab === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {tab === "overview" && <Overview scan={scan} counts={counts} />}
      {tab === "vulns" && <VulnsView scan={scan} />}
      {tab === "ports" && <PortsView scan={scan} />}
      {tab === "ssl" && <SslView scan={scan} />}
      {tab === "http" && <HttpView scan={scan} />}
      {tab === "web" && <WebView scan={scan} />}
      {tab === "dns" && <DnsView scan={scan} />}
      {tab === "subdomains" && <SubdomainsView scan={scan} />}
      {tab === "security" && <SecurityView scan={scan} />}
      {tab === "ai" && <AiView scan={scan} chat={<AiChat scanId={scan.id} />} />}

      <ExportBar scan={scan} />
    </div>
  );
}

function Overview({ scan, counts }: { scan: ScanRecord; counts: Record<Severity, number> }) {
  const r = scan.results!;
  const { ai, risk } = r;
  const openPorts = r.ports.filter((p) => p.state === "open");
  const portBars = [
    { label: "Open", value: r.ports.filter((p) => p.state === "open").length, color: "#34d399" },
    { label: "Filtered", value: r.ports.filter((p) => p.state === "filtered").length, color: "#fbbf24" },
    { label: "Closed", value: r.ports.filter((p) => p.state === "closed").length, color: "#64748b" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <SectionTitle title="Security score" subtitle={`Grade ${risk.grade} · ${risk.label}`} />
          <div className="grid place-items-center py-2">
            <RiskGauge score={risk.score} grade={risk.grade} />
          </div>
          <div className="mt-2 space-y-1.5">
            {risk.deductions.slice(0, 5).map((d, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: SEVERITY_DOT[d.severity] }} />
                  {d.reason}
                </span>
                <span className="font-mono text-danger">-{d.points}</span>
              </div>
            ))}
            {risk.deductions.length === 0 && <p className="text-xs text-success">No deductions — well hardened. ✓</p>}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <SectionTitle title="Attack surface" subtitle={`Estimated exposure: ${ai.attackSurface.level}`} icon={<span>🎯</span>} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="text-3xl font-bold" style={{ color: riskColor(100 - ai.attackSurface.score) }}>
                {ai.attackSurface.score}
              </div>
              <div className="text-xs text-muted">surface score</div>
              <ul className="mt-3 space-y-1.5">
                {ai.attackSurface.factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-muted">
                    <span className="mt-1 h-1 w-1 rounded-full bg-brand" /> {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {ai.keyMetrics.map((m) => (
                <div key={m.label} className="rounded-lg border border-line bg-white/[0.02] p-3">
                  <div className="text-lg font-bold">{m.value}</div>
                  <div className="text-[0.65rem] text-muted">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="Network topology" subtitle="Discovered services, technologies & subdomains" icon={<span>🕸️</span>} />
          <NetworkGraph result={r} />
        </Card>
        <Card>
          <SectionTitle title="Findings" subtitle={`${r.findings.length} total`} icon={<span>🛡️</span>} />
          <FindingsDonut counts={counts} />
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <SectionTitle title="Port states" icon={<span>🔌</span>} />
          <BarChart data={portBars} />
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle title="Port heatmap" subtitle={`${openPorts.length} open of ${r.ports.length} probed`} icon={<span>🔥</span>} />
          <PortHeatmap ports={r.ports} />
          <div className="mt-3 flex flex-wrap gap-3 text-[0.7rem] text-muted">
            <LegendDot color="#34d399" label="Open" />
            <LegendDot color="#fbbf24" label="Filtered" />
            <LegendDot color="#64748b" label="Closed" />
          </div>
        </Card>
      </div>

      <Card>
        <SectionTitle title="Host intelligence" icon={<span>🌍</span>} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="IP address" value={r.meta.ipAddresses.join(", ") || "—"} mono />
          <Info label="Reverse DNS" value={r.host.reverseDns.join(", ") || "—"} mono />
          <Info label="Geolocation" value={r.host.geo ? `${r.host.geo.city}, ${r.host.geo.country}` : "—"} />
          <Info label="Hosting / ASN" value={r.host.asn ? `${r.host.asn.org || "—"} ${r.host.asn.number || ""}` : "—"} />
          <Info label="ISP" value={r.host.geo?.isp || "—"} />
          <Info label="Coordinates" value={r.host.geo ? `${r.host.geo.lat.toFixed(2)}, ${r.host.geo.lon.toFixed(2)}` : "—"} mono />
          <Info label="DNS records" value={`${r.dns.length}`} />
          <Info label="Probes executed" value={`${r.meta.probes}`} />
        </div>
        {r.host.whois && (
          <div className="mt-4 grid gap-3 rounded-lg border border-line bg-white/[0.02] p-4 text-xs sm:grid-cols-3">
            <Info label="Registrar" value={r.host.whois.registrar || "—"} />
            <Info label="Registered" value={r.host.whois.createdDate ? new Date(r.host.whois.createdDate).toLocaleDateString() : "—"} />
            <Info label="Expires" value={r.host.whois.expiresDate ? new Date(r.host.whois.expiresDate).toLocaleDateString() : "—"} />
          </div>
        )}
      </Card>
    </div>
  );
}

function VulnsView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  const vulns = [...r.vulnerabilities].sort((a, b) => b.cvss - a.cvss);
  if (!vulns.length)
    return (
      <Card>
        <div className="py-12 text-center">
          <div className="mb-3 text-4xl">🛡️</div>
          <h3 className="font-semibold">No known CVEs matched</h3>
          <p className="mt-1 text-sm text-muted">
            Detected software versions did not match any entry in the vulnerability database.
          </p>
        </div>
      </Card>
    );
  const exploitable = vulns.filter((v) => v.exploit).length;
  return (
    <Card>
      <SectionTitle
        title={`Vulnerability intelligence (${vulns.length})`}
        subtitle={`${exploitable} with public exploits — matched against the CVE database`}
        icon={<span>🧨</span>}
      />
      <div className="space-y-3">
        {vulns.map((v) => (
          <div
            key={`${v.cve}-${v.port ?? "tech"}`}
            className="flex flex-wrap items-start gap-4 rounded-lg border border-line bg-white/[0.02] p-4"
          >
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-lg text-center"
              style={{
                background:
                  v.cvss >= 9 ? "rgba(244,63,94,0.15)" : v.cvss >= 7 ? "rgba(251,113,133,0.12)" : "rgba(251,191,36,0.12)",
                color: v.cvss >= 9 ? "#fda4af" : v.cvss >= 7 ? "#fb7185" : "#fcd34d",
              }}
            >
              <span className="text-lg font-bold leading-none">{v.cvss}</span>
              <span className="text-[0.55rem] uppercase">cvss</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded border border-line bg-black/40 px-1.5 py-0.5 font-mono text-xs text-brand">{v.cve}</code>
                <SeverityBadge severity={v.severity} />
                {v.exploit && <span className="badge sev-critical">⚡ exploit</span>}
                {v.port && <span className="text-xs text-muted">port {v.port}</span>}
              </div>
              <div className="mt-1.5 text-sm font-semibold">{v.title}</div>
              <p className="mt-0.5 text-xs text-muted">{v.description}</p>
              <div className="mt-1 text-[0.7rem] text-muted">
                Affected: <span className="text-brand">{v.product}{v.version ? ` ${v.version}` : ""}</span>
                {v.exploit && <span className="ml-2 text-danger">⚠ actively exploitable</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PortsView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  return (
    <Card className="overflow-x-auto !p-0">
      <div className="border-b border-line px-5 py-4">
        <h3 className="font-semibold">Port & service analysis</h3>
        <p className="text-xs text-muted">{r.ports.length} ports probed · {r.ports.filter((p) => p.state === "open").length} open</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-5 py-2.5 font-medium">Port</th>
            <th className="px-5 py-2.5 font-medium">State</th>
            <th className="px-5 py-2.5 font-medium">Service</th>
            <th className="px-5 py-2.5 font-medium">Product / Version</th>
            <th className="px-5 py-2.5 font-medium">Banner</th>
          </tr>
        </thead>
        <tbody>
          {r.ports.map((p) => (
            <tr key={`${p.port}-${p.protocol}`} className="border-b border-line/40 last:border-0">
              <td className="px-5 py-2.5 font-mono">{p.port}/{p.protocol}</td>
              <td className="px-5 py-2.5">
                <span className={cn("badge", p.state === "open" ? "sev-low" : p.state === "filtered" ? "sev-medium" : "sev-info")}>{p.state}</span>
              </td>
              <td className="px-5 py-2.5">{p.service}</td>
              <td className="px-5 py-2.5 text-muted">{p.product ? `${p.product}${p.version ? ` ${p.version}` : ""}` : "—"}</td>
              <td className="max-w-xs truncate px-5 py-2.5 font-mono text-[0.7rem] text-muted" title={p.banner}>{p.banner || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function SslView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  if (!r.ssl.length) return <EmptyTab icon="🔒" title="No TLS data" desc="No SSL/TLS endpoints were reachable on this target." />;
  return (
    <div className="space-y-6">
      {r.ssl.map((s) => (
        <Card key={s.host + s.port}>
          <div className="flex items-center justify-between">
            <SectionTitle title={s.subjectCN} subtitle={`${s.host}:${s.port} · ${s.tlsVersion} · ${s.cipherName}`} />
            <div className="text-right">
              <div className="text-2xl font-bold" style={{ color: riskColor(s.score) }}>{s.grade}</div>
              <div className="text-[0.65rem] text-muted">{s.score}/100</div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Info label="Issuer" value={`${s.issuerCN}${s.issuerOrg ? ` (${s.issuerOrg})` : ""}`} />
            <Info label="Valid from" value={new Date(s.validFrom).toLocaleDateString()} />
            <Info label="Valid to" value={new Date(s.validTo).toLocaleDateString()} />
            <Info label="Expires in" value={`${s.daysUntilExpiry} days`} />
            <Info label="Signature" value={s.signatureAlgorithm} mono />
            <Info label="Key" value={`${s.keyBits || "?"} bit ${s.keyType}`} />
            <Info label="Self-signed" value={s.selfSigned ? "Yes" : "No"} />
            <Info label="Wildcard" value={s.wildcard ? "Yes" : "No"} />
          </div>
          {s.weakConfigs.length > 0 && (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger/5 p-3">
              <div className="mb-1 text-xs font-semibold text-danger">Weak configurations detected</div>
              <ul className="space-y-1 text-xs text-muted">
                {s.weakConfigs.map((w, i) => <li key={i}>• {w}</li>)}
              </ul>
            </div>
          )}
          {s.san.length > 0 && (
            <div className="mt-4">
              <div className="mb-1.5 text-xs text-muted">Subject Alternative Names ({s.san.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {s.san.slice(0, 12).map((n) => <MonoLabel key={n}>{n}</MonoLabel>)}
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

const HEADER_LABELS: Record<string, string> = {
  "strict-transport-security": "HSTS",
  "content-security-policy": "Content-Security-Policy",
  "x-frame-options": "X-Frame-Options",
  "x-content-type-options": "X-Content-Type-Options",
  "referrer-policy": "Referrer-Policy",
  "permissions-policy": "Permissions-Policy",
  "cross-origin-opener-policy": "COOP",
  "x-xss-protection": "X-XSS-Protection",
};

function HttpView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  if (!r.http.length) return <EmptyTab icon="📡" title="No HTTP data" desc="No HTTP/HTTPS endpoints responded." />;
  return (
    <div className="space-y-6">
      {r.http.map((h) => (
        <Card key={h.url}>
          <SectionTitle title={`${h.scheme.toUpperCase()} ${h.statusCode} ${h.statusText}`} subtitle={h.finalUrl} icon={<span>🌐</span>} />
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Info label="Server" value={h.server || "—"} />
                <Info label="Powered by" value={h.poweredBy || "—"} />
                <Info label="CMS" value={h.cms || "—"} />
                <Info label="Compression" value={h.compression || "—"} />
                <Info label="Title" value={h.title || "—"} />
                <Info label="Body size" value={`${(h.bodyBytes / 1024).toFixed(1)} KB`} />
              </div>
              {h.redirects.length > 0 && (
                <div>
                  <div className="mb-1 text-xs text-muted">Redirect chain</div>
                  <div className="space-y-1 text-[0.7rem] text-muted">
                    {h.redirects.map((rd, i) => <div key={i} className="font-mono">{rd.status} → {rd.location}</div>)}
                  </div>
                </div>
              )}
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-muted">Security headers</div>
              <div className="space-y-1.5">
                {Object.entries(h.securityHeaders).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-muted">{HEADER_LABELS[k] || k}</span>
                    <span className={v ? "text-success" : "text-danger"}>{v ? "✓ present" : "✗ missing"}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 text-xs font-medium text-muted">Technologies ({h.technologies.length})</div>
              <div className="flex flex-wrap gap-1.5">
                {h.technologies.map((t) => <span key={t} className="rounded-md border border-brand/20 bg-brand/5 px-2 py-0.5 text-[0.7rem] text-brand">{t}</span>)}
              </div>
              {h.cookies.length > 0 && (
                <div className="mt-3">
                  <div className="mb-1.5 text-xs text-muted">Cookies ({h.cookies.length})</div>
                  <div className="space-y-1">
                    {h.cookies.map((c) => (
                      <div key={c.name} className="flex items-center gap-1.5 text-[0.7rem]">
                        <span className="font-mono text-muted">{c.name}</span>
                        <span className={c.secure ? "text-success" : "text-danger"}>{c.secure ? "S" : "!"}</span>
                        <span className={c.httpOnly ? "text-success" : "text-danger"}>{c.httpOnly ? "H" : "!"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function WebView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  const web = r.web;
  return (
    <div className="space-y-6">
      {/* WAF */}
      <Card>
        <SectionTitle title="WAF / CDN detection" icon={<span>🛡️</span>} />
        {r.waf?.detected ? (
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-xl border border-brand/30 bg-brand/10 text-2xl">🛡️</div>
            <div>
              <div className="text-lg font-bold text-brand">{r.waf.name}</div>
              <div className="text-xs text-muted">{r.waf.vendor} · {(r.waf.confidence * 100).toFixed(0)}% confidence</div>
              {r.waf.evidence.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.waf.evidence.slice(0, 4).map((e, i) => (
                    <code key={i} className="rounded border border-line bg-black/30 px-1.5 py-0.5 font-mono text-[0.65rem] text-muted">{e}</code>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">No WAF/CDN detected — the origin server is directly exposed.</p>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* robots.txt */}
        <Card>
          <SectionTitle title="robots.txt" icon={<span>🤖</span>} />
          {web.robotsTxt?.found ? (
            <div>
              <div className="mb-2 text-xs text-muted">{web.robotsTxt.disallow.length} disallowed paths</div>
              <div className="flex flex-wrap gap-1.5">
                {web.robotsTxt.disallow.slice(0, 16).map((d, i) => (
                  <code key={i} className="rounded border border-warning/20 bg-warning/5 px-1.5 py-0.5 font-mono text-[0.65rem] text-warning">{d}</code>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">No robots.txt found.</p>
          )}
        </Card>

        {/* CORS & methods */}
        <Card>
          <SectionTitle title="CORS & methods" icon={<span>🔌</span>} />
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">CORS</span>
              <span className={web.cors.allowed ? "text-danger" : "text-success"}>
                {web.cors.allowed ? (web.cors.credentials ? "⚠ wildcard + credentials" : "permissive") : "restricted ✓"}
              </span>
            </div>
            {web.allowedMethods.length > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-muted">Methods</span>
                <div className="flex gap-1">
                  {web.allowedMethods.map((m) => (
                    <code key={m} className={cn(
                      "rounded px-1.5 py-0.5 font-mono text-[0.65rem]",
                      ["PUT", "DELETE", "TRACE", "CONNECT"].includes(m) ? "bg-danger/10 text-danger" : "bg-white/5 text-muted"
                    )}>{m}</code>
                  ))}
                </div>
              </div>
            )}
            {web.faviconHash && (
              <div className="flex items-center justify-between">
                <span className="text-muted">Favicon hash</span>
                <code className="font-mono text-[0.65rem] text-brand">{web.faviconHash.slice(0, 16)}…</code>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Discovered paths */}
      {web.discoveredPaths.length > 0 && (
        <Card>
          <SectionTitle title={`Discovered paths (${web.discoveredPaths.length})`} subtitle="Common admin/config/sensitive locations" icon={<span>📁</span>} />
          <div className="grid gap-1.5 sm:grid-cols-2">
            {web.discoveredPaths.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded border border-line bg-white/[0.02] px-3 py-1.5">
                <code className={cn("font-mono text-xs", p.interesting ? "text-warning" : "text-brand")}>{p.path}</code>
                <div className="flex items-center gap-2">
                  {p.title && <span className="hidden truncate text-[0.65rem] text-muted sm:inline">{p.title}</span>}
                  <span className={cn(
                    "badge",
                    p.status === 200 ? "sev-low" : p.status === 401 || p.status === 403 ? "sev-medium" : "sev-info"
                  )}>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Source disclosure */}
      {web.sourceDisclosure.length > 0 ? (
        <Card>
          <SectionTitle title="Source disclosure" subtitle="Critical — exposed repo/config files" icon={<span>🔓</span>} />
          <div className="space-y-2">
            {web.sourceDisclosure.map((s, i) => (
              <div key={i} className="rounded-lg border border-danger/30 bg-danger/5 p-3">
                <div className="flex items-center gap-2">
                  <span className="badge sev-critical">{s.type}</span>
                  <code className="font-mono text-xs text-brand">{s.url}</code>
                </div>
                <code className="mt-1 block truncate font-mono text-[0.65rem] text-muted">{s.evidence}</code>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex items-center gap-2 text-sm text-success">
            ✓ No source-code disclosure detected (<code className="font-mono text-xs">.git</code>, <code className="font-mono text-xs">.env</code>, etc.)
          </div>
        </Card>
      )}
    </div>
  );
}

function DnsView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  if (!r.dns.length) return <EmptyTab icon="🌐" title="No DNS data" desc="No DNS records were enumerated for this target." />;
  return (
    <Card>
      <SectionTitle title="DNS records" icon={<span>🌐</span>} />
      {r.zoneTransfer.allowed ? (
        <div className="mb-3 rounded-lg border border-danger/30 bg-danger/10 p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-danger">
            ⚠ Zone transfer (AXFR) permitted
          </div>
          <p className="mt-1 text-xs text-muted">
            The nameserver {r.zoneTransfer.server} allowed a full zone dump ({r.zoneTransfer.records?.length ?? 0} records).
            This exposes internal hostnames. Restrict AXFR to trusted secondaries.
          </p>
        </div>
      ) : (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-2 text-xs text-success">
          ✓ Zone transfer (AXFR) correctly refused
        </div>
      )}
      <div className="space-y-2">
        {r.dns.map((rec) => (
          <div key={rec.type} className="rounded-lg border border-line bg-white/[0.02] p-3">
            <div className="mb-1 flex items-center gap-2">
              <span className="badge sev-info">{rec.type}</span>
              <span className="text-xs text-muted">{rec.values.length} record(s)</span>
            </div>
            <div className="space-y-0.5">
              {rec.values.map((v, i) => <div key={i} className="font-mono text-xs text-muted">{v}</div>)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SubdomainsView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  if (!r.subdomains.length) return <EmptyTab icon="🕸️" title="No subdomains found" desc="Subdomain enumeration returned no results (or was not selected)." />;
  return (
    <Card>
      <SectionTitle title={`Subdomains (${r.subdomains.length})`} subtitle="Discovered via DNS brute-force" icon={<span>🕸️</span>} />
      <div className="grid gap-2 sm:grid-cols-2">
        {r.subdomains.map((s) => (
          <div key={s.hostname} className="flex items-center justify-between rounded-lg border border-line bg-white/[0.02] p-3">
            <div>
              <div className="font-mono text-xs text-brand">{s.hostname}</div>
              <div className="font-mono text-[0.7rem] text-muted">{s.ips.join(", ")}</div>
            </div>
            <span className="badge sev-low">resolved</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SecurityView({ scan }: { scan: ScanRecord }) {
  const r = scan.results!;
  const [filter, setFilter] = useState<string>("all");
  const findings = (filter === "all" ? r.findings : r.findings.filter((f) => f.severity === filter)).sort(
    (a, b) => ["critical", "high", "medium", "low", "info"].indexOf(a.severity) - ["critical", "high", "medium", "low", "info"].indexOf(b.severity),
  );
  return (
    <Card>
      <SectionTitle title="Security findings" subtitle={`${r.findings.length} findings across ${new Set(r.findings.map((f) => f.category)).size} categories`} icon={<span>🛡️</span>} />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {["all", "critical", "high", "medium", "low", "info"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} data-active={filter === s} className="chip capitalize">{s}</button>
        ))}
      </div>
      <div className="space-y-3">
        {findings.map((f) => <FindingCard key={f.id} f={f} />)}
        {findings.length === 0 && <p className="py-8 text-center text-sm text-muted">No findings in this category.</p>}
      </div>
    </Card>
  );
}

function FindingCard({ f }: { f: Finding }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cn("rounded-lg border bg-white/[0.02] p-4 transition", open && "border-line-strong")}>
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <SeverityBadge severity={f.severity} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{f.title}</div>
          <div className="mt-0.5 line-clamp-2 text-xs text-muted">{f.description}</div>
        </div>
        <span className="text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-2 border-t border-line pt-3 text-xs">
          {f.evidence && (
            <div><span className="text-muted">Evidence: </span><code className="font-mono text-brand">{f.evidence}</code></div>
          )}
          {f.impact && <div><span className="text-muted">Impact: </span>{f.impact}</div>}
          <div className="rounded-md border border-success/20 bg-success/5 p-2">
            <span className="font-semibold text-success">Recommendation: </span>{f.recommendation}
          </div>
        </div>
      )}
    </div>
  );
}

function AiView({ scan, chat }: { scan: ScanRecord; chat: React.ReactNode }) {
  const r = scan.results!;
  const { ai } = r;
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <SectionTitle title="Executive summary" subtitle="Generated intelligence briefing" icon={<span>🤖</span>} />
            <p className="text-sm leading-relaxed text-ink/90">{ai.executiveSummary}</p>
          </Card>
          <Card>
            <SectionTitle title="Plain-English explanation" subtitle="For non-technical stakeholders" icon={<span>📖</span>} />
            <p className="text-sm leading-relaxed text-muted">{ai.beginnerExplanation}</p>
          </Card>
        </div>
        <Card>
          {chat}
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <SectionTitle title="Remediation priorities" icon={<span>✅</span>} />
          <div className="space-y-2.5">
            {ai.improvements.length === 0 && <p className="text-sm text-success">No urgent remediation required.</p>}
            {ai.improvements.map((imp, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.65rem] font-bold" style={{ background: SEVERITY_DOT[imp.severity] + "22", color: SEVERITY_DOT[imp.severity] }}>{i + 1}</span>
                <div>
                  <div className="text-sm font-medium">{imp.title}</div>
                  <div className="text-xs text-muted">{imp.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Card>
        <SectionTitle title="Prioritized risks" icon={<span>⚠️</span>} />
        <div className="space-y-2">
          {ai.prioritizedRisks.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-line bg-white/[0.02] p-3">
              <SeverityBadge severity={f.severity} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{f.title}</div>
                <div className="truncate text-xs text-muted">{f.recommendation}</div>
              </div>
            </div>
          ))}
          {ai.prioritizedRisks.length === 0 && <p className="text-sm text-success">No critical or high risks identified.</p>}
        </div>
      </Card>
      {r.risk.positives.length > 0 && (
        <Card>
          <SectionTitle title="Security positives" subtitle="What's being done well" icon={<span>💚</span>} />
          <ul className="space-y-2">
            {r.risk.positives.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted">
                <span className="text-success">✓</span> {p}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ExportBar({ scan }: { scan: ScanRecord }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = typeof window !== "undefined" ? `${window.location.origin}/r/${scan.shareToken}` : "";
  return (
    <Card className="!py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-xs font-medium text-muted">Export:</span>
        <a href={`/api/scans/${scan.id}/export?format=md`} className="btn btn-ghost !py-1.5 !text-xs">Markdown</a>
        <a href={`/api/scans/${scan.id}/export?format=json`} className="btn btn-ghost !py-1.5 !text-xs">JSON</a>
        <a href={`/api/scans/${scan.id}/export?format=ports`} className="btn btn-ghost !py-1.5 !text-xs">Ports CSV</a>
        <a href={`/api/scans/${scan.id}/export?format=findings`} className="btn btn-ghost !py-1.5 !text-xs">Findings CSV</a>
        <a href={`/r/${scan.shareToken}`} target="_blank" rel="noreferrer" className="btn btn-ghost !py-1.5 !text-xs">🖨️ Print / PDF</a>
        <button
          onClick={() => { navigator.clipboard?.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          className="btn btn-primary !py-1.5 !text-xs"
        >
          {copied ? "✓ Copied" : "Share link"}
        </button>
      </div>
    </Card>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-0.5 truncate text-sm", mono && "font-mono text-xs")} title={value}>{value}</div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{label}</span>;
}

function EmptyTab({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <Card>
      <div className="py-12 text-center">
        <div className="mb-3 text-4xl">{icon}</div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{desc}</p>
      </div>
    </Card>
  );
}
