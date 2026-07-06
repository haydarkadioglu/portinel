import Link from "next/link";
import { notFound } from "next/navigation";
import { getScanByShareToken } from "@/lib/scan-service";
import { Logo, SeverityBadge, Card } from "@/components/ui";
import { RiskGauge, FindingsDonut } from "@/components/charts";
import { PrintButton } from "@/components/print-button";
import { riskColor, formatDateTime } from "@/lib/utils";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SharedReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const scan = await getScanByShareToken(token);
  if (!scan || !scan.results) notFound();
  const r = scan.results;
  const openPorts = r.ports.filter((p) => p.state === "open");
  const counts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of r.findings) counts[f.severity]++;

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Logo />
          <div className="flex items-center gap-2">
            <PrintButton />
            <Link href="/" className="btn btn-ghost !py-1.5 !text-xs">Portinel</Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-brand">Security Report</div>
            <h1 className="mt-1 font-mono text-3xl font-bold">{scan.target}</h1>
            <p className="mt-1 text-sm text-muted">{formatDateTime(scan.createdAt)} · {scan.scanTypes.join(", ")}</p>
          </div>
          <div className="flex items-center gap-6">
            <RiskGauge score={r.risk.score} grade={r.risk.grade} size={150} />
          </div>
        </div>

        <Card>
          <h2 className="mb-2 font-semibold">Executive summary</h2>
          <p className="text-sm leading-relaxed text-ink/90">{r.ai.executiveSummary}</p>
          <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
            <Meta label="Attack surface" value={r.ai.attackSurface.level} />
            <Meta label="Open ports" value={`${openPorts.length}`} />
            <Meta label="Findings" value={`${r.findings.length}`} />
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <h2 className="mb-3 font-semibold">Findings by severity</h2>
            <FindingsDonut counts={counts} />
          </Card>
          <Card>
            <h2 className="mb-3 font-semibold">Score breakdown</h2>
            <div className="space-y-1.5">
              {r.risk.deductions.length === 0 && <p className="text-sm text-success">No deductions.</p>}
              {r.risk.deductions.map((d, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-muted">{d.reason}</span>
                  <span className="font-mono text-danger">-{d.points}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <Card>
          <h2 className="mb-3 font-semibold">Key findings ({r.findings.length})</h2>
          <div className="space-y-2">
            {r.findings
              .slice()
              .sort((a, b) => ["critical", "high", "medium", "low", "info"].indexOf(a.severity) - ["critical", "high", "medium", "low", "info"].indexOf(b.severity))
              .map((f) => (
                <div key={f.id} className="rounded-lg border border-line bg-white/[0.02] p-3">
                  <div className="flex items-center gap-2">
                    <SeverityBadge severity={f.severity} />
                    <span className="text-sm font-medium">{f.title}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{f.description}</p>
                  <p className="mt-1 text-xs"><span className="text-success">Fix:</span> {f.recommendation}</p>
                </div>
              ))}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Open ports ({openPorts.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-2 pr-4">Port</th><th className="py-2 pr-4">Service</th><th className="py-2 pr-4">Product</th></tr></thead>
              <tbody>
                {openPorts.map((p) => (
                  <tr key={p.port} className="border-b border-line/40 last:border-0">
                    <td className="py-2 pr-4 font-mono">{p.port}/tcp</td>
                    <td className="py-2 pr-4">{p.service}</td>
                    <td className="py-2 pr-4 text-muted">{p.product ? `${p.product}${p.version ? ` ${p.version}` : ""}` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <footer className="pt-4 text-center text-xs text-muted">
          Generated by Portinel · automated cyber reconnaissance · score {r.risk.score} (grade {r.risk.grade})
        </footer>
      </main>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.02] p-3">
      <div className="text-lg font-bold" style={{ color: riskColor(70) }}>{value}</div>
      <div className="text-[0.65rem] text-muted">{label}</div>
    </div>
  );
}
