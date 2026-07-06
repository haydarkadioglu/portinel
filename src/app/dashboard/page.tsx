import Link from "next/link";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { toScanRecord } from "@/lib/scan-service";
import { StatCard, Card, SectionTitle, EmptyState, SeverityBadge } from "@/components/ui";
import { NetworkGraph, FindingsDonut, Timeline } from "@/components/charts";
import { timeAgo, riskColor } from "@/lib/utils";
import type { Severity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(scans)
    .where(eq(scans.userId, user.id))
    .orderBy(desc(scans.createdAt))
    .limit(50);
  const records = rows.map(toScanRecord);
  const completed = records.filter((r) => r.status === "completed" && r.results);
  const avgRisk = completed.length
    ? Math.round(completed.reduce((a, r) => a + (r.riskScore ?? 0), 0) / completed.length)
    : 0;
  const totalOpen = completed.reduce((a, r) => a + r.openPortCount, 0);
  const targets = new Set(records.map((r) => r.target)).size;
  const latest = completed[0];

  const severityCounts: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const r of completed)
    for (const f of r.results?.findings ?? [])
      severityCounts[f.severity]++;

  const timelineItems = records.slice(0, 6).map((r) => ({
    time: timeAgo(r.createdAt),
    title: `${r.target}`,
    desc: `${r.scanTypes.length} modules · grade ${r.grade ?? "—"}`,
    tone: r.status === "failed" ? "#f43f5e" : riskColor(r.riskScore ?? 100),
  }));

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, {user.name.split(" ")[0]}
          </h1>
          <p className="text-sm text-muted">
            Your reconnaissance operations at a glance.
          </p>
        </div>
        <Link href="/dashboard/scans/new" className="btn btn-primary">
          + New Scan
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total scans" value={records.length} sub={`${targets} unique targets`} icon="🛰️" accent="brand" />
        <StatCard label="Avg. risk score" value={avgRisk || "—"} sub="Across completed scans" icon="📈" accent={avgRisk >= 70 ? "success" : avgRisk >= 50 ? "warning" : "danger"} />
        <StatCard label="Open ports found" value={totalOpen} sub="Cumulative" icon="🔓" accent="warning" />
        <StatCard label="Critical findings" value={severityCounts.critical} sub="Require attention" icon="⚠️" accent="danger" />
      </div>

      {records.length === 0 ? (
        <EmptyState
          icon="🛰️"
          title="No scans yet"
          description="Run your first reconnaissance scan to start mapping your attack surface."
          action={<Link href="/dashboard/scans/new" className="btn btn-primary">Run your first scan</Link>}
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <SectionTitle title="Recent scans" subtitle="Latest reconnaissance operations" icon={<span>🧭</span>} action={<Link href="/dashboard/scans" className="text-xs font-semibold text-brand">View all →</Link>} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                      <th className="pb-2 pr-4 font-medium">Target</th>
                      <th className="pb-2 pr-4 font-medium">Status</th>
                      <th className="pb-2 pr-4 font-medium">Risk</th>
                      <th className="pb-2 pr-4 font-medium">Ports</th>
                      <th className="pb-2 font-medium">When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.slice(0, 6).map((r) => (
                      <tr key={r.id} className="border-b border-line/50 last:border-0">
                        <td className="py-2.5 pr-4">
                          <Link href={`/dashboard/scans/${r.id}`} className="font-mono text-[0.8rem] text-brand hover:underline">
                            {r.target}
                          </Link>
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={r.status === "completed" ? "text-success" : r.status === "failed" ? "text-danger" : "text-muted"}>
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4">
                          {r.riskScore !== null ? (
                            <span className="font-semibold" style={{ color: riskColor(r.riskScore) }}>{r.riskScore} · {r.grade}</span>
                          ) : "—"}
                        </td>
                        <td className="py-2.5 pr-4 text-muted">{r.openPortCount}</td>
                        <td className="py-2.5 text-muted">{timeAgo(r.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {latest?.results && (
              <Card>
                <SectionTitle title="Latest target topology" subtitle={latest.target} icon={<span>🕸️</span>} />
                <NetworkGraph result={latest.results} />
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card>
              <SectionTitle title="Findings" subtitle="By severity" icon={<span>🛡️</span>} />
              <FindingsDonut counts={severityCounts} />
            </Card>
            <Card>
              <SectionTitle title="Activity" icon={<span>🕓</span>} />
              <Timeline items={timelineItems} />
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
