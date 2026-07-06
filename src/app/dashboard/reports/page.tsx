import Link from "next/link";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { toScanRecord } from "@/lib/scan-service";
import { Card, EmptyState } from "@/components/ui";
import { CopyLink } from "@/components/copy-link";
import { formatDateTime, riskColor } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(scans)
    .where(eq(scans.status, "completed"))
    .orderBy(desc(scans.createdAt))
    .limit(50);
  const records = rows.map(toScanRecord).filter((r) => r.userId === user.id && r.results);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
        <p className="text-sm text-muted">Export and share your scan reports.</p>
      </div>

      {records.length === 0 ? (
        <EmptyState icon="📄" title="No reports yet" description="Completed scans appear here, ready to export or share." action={<Link href="/dashboard/scans/new" className="btn btn-primary">Run a scan</Link>} />
      ) : (
        <div className="space-y-3">
          {records.map((r) => (
            <Card key={r.id} className="!py-4">
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/scans/${r.id}`} className="font-mono text-sm font-semibold text-brand hover:underline">{r.target}</Link>
                  <div className="text-xs text-muted">{formatDateTime(r.createdAt)} · {r.openPortCount} open ports</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold" style={{ color: riskColor(r.riskScore ?? 100) }}>{r.riskScore}</div>
                  <div className="text-[0.65rem] text-muted">grade {r.grade}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <a href={`/api/scans/${r.id}/export?format=md`} className="btn btn-ghost !py-1.5 !text-xs">.md</a>
                  <a href={`/api/scans/${r.id}/export?format=json`} className="btn btn-ghost !py-1.5 !text-xs">.json</a>
                  <a href={`/api/scans/${r.id}/export?format=findings`} className="btn btn-ghost !py-1.5 !text-xs">.csv</a>
                  <a href={`/r/${r.shareToken}`} target="_blank" rel="noreferrer" className="btn btn-ghost !py-1.5 !text-xs">View</a>
                  <CopyLink token={r.shareToken!} />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
