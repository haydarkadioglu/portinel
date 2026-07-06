import Link from "next/link";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { eq, desc, ilike, and } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { toScanRecord } from "@/lib/scan-service";
import { Card, EmptyState } from "@/components/ui";
import { timeAgo, riskColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  const { q } = await searchParams;
  const rows = await db
    .select()
    .from(scans)
    .where(and(eq(scans.userId, user.id), q ? ilike(scans.target, `%${q}%`) : undefined))
    .orderBy(desc(scans.createdAt))
    .limit(100);
  const records = rows.map(toScanRecord);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Scan history</h1>
          <p className="text-sm text-muted">{records.length} reconnaissance operations.</p>
        </div>
        <Link href="/dashboard/scans/new" className="btn btn-primary">+ New scan</Link>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Search targets…" className="input max-w-xs" />
        <button type="submit" className="btn btn-ghost">Search</button>
      </form>

      {records.length === 0 ? (
        <EmptyState icon="🔍" title="No scans found" description="Adjust your search or run a new scan." action={<Link href="/dashboard/scans/new" className="btn btn-primary">New scan</Link>} />
      ) : (
        <Card className="overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-medium">Target</th>
                <th className="px-4 py-3 font-medium">Modules</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Risk</th>
                <th className="px-4 py-3 font-medium">Ports</th>
                <th className="px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id} className="border-b border-line/40 transition hover:bg-white/[0.02] last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/dashboard/scans/${r.id}`} className="font-mono text-[0.8rem] text-brand hover:underline">
                      {r.target}
                    </Link>
                    <div className="text-[0.7rem] text-muted">{r.targetType}</div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted">{r.scanTypes.length} modules</td>
                  <td className="px-4 py-3">
                    <span className={r.status === "completed" ? "text-success" : r.status === "failed" ? "text-danger" : "text-warning"}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3">
                    {r.riskScore !== null ? (
                      <span className="font-semibold" style={{ color: riskColor(r.riskScore) }}>{r.riskScore} · {r.grade}</span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted">{r.openPortCount}</td>
                  <td className="px-4 py-3 text-muted">{timeAgo(r.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
