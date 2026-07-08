import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { and, eq, lt, desc } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { getScan, toScanRecord, diffScans, getScanTree } from "@/lib/scan-service";
import { ScanResults } from "@/components/scan-results";
import { ScanTree } from "@/components/scan-tree";
import { SubscanLauncher } from "@/components/subscan-launcher";
import { Card, SectionTitle, EmptyState } from "@/components/ui";
import { Timeline } from "@/components/charts";
import { formatDateTime, riskColor, countDescendants } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ScanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const scan = await getScan(id, user.id);
  if (!scan) notFound();

  let diff = null;
  if (scan.results) {
    const [prior] = await db
      .select()
      .from(scans)
      .where(
        and(
          eq(scans.userId, user.id),
          eq(scans.target, scan.target),
          eq(scans.status, "completed"),
          lt(scans.createdAt, new Date(scan.createdAt)),
        ),
      )
      .orderBy(desc(scans.createdAt))
      .limit(1);
    if (prior && (prior.results as unknown)) {
      const before = toScanRecord(prior);
      const d = diffScans(before, scan);
      if (d.addedPorts.length || d.removedPorts.length || d.newFindings.length || d.resolvedFindings.length)
        diff = d;
    }
  }

  // Fetch the scan tree (this scan + descendants).
  const tree = await getScanTree(id, user.id);
  const rootId = scan.rootId || scan.id;
  const descendantCount = countDescendants(tree, rootId);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/dashboard/scans" className="text-xs text-muted hover:text-ink">← Back to history</Link>
          <h1 className="mt-1 truncate font-mono text-2xl font-bold tracking-tight">{scan.target}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="capitalize">{scan.targetType}</span>
            <span>{scan.scanTypes.join(" · ")}</span>
            <span>{formatDateTime(scan.createdAt)}</span>
            {scan.durationMs && <span>{(scan.durationMs / 1000).toFixed(1)}s</span>}
          </div>
        </div>
        {scan.riskScore !== null && (
          <div className="text-right">
            <div className="text-4xl font-bold" style={{ color: riskColor(scan.riskScore) }}>{scan.riskScore}</div>
            <div className="text-xs text-muted">Grade {scan.grade} · /100</div>
          </div>
        )}
      </div>

      {scan.status === "failed" && (
        <EmptyState icon="⚠️" title="Scan could not complete" description={scan.error || "The scan encountered an error."} action={<Link href="/dashboard/scans/new" className="btn btn-primary">Retry</Link>} />
      )}

      {diff && (
        <Card>
          <SectionTitle title="Changes since last scan" subtitle={`Compared to ${formatDateTime(diff.before.createdAt)}`} icon={<span>🔁</span>} />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-3 text-sm">
                <Delta label="Risk score" value={`${diff.riskDelta >= 0 ? "+" : ""}${diff.riskDelta}`} tone={diff.riskDelta > 0 ? "danger" : diff.riskDelta < 0 ? "success" : "muted"} />
                <Delta label="New ports" value={`${diff.addedPorts.length}`} tone={diff.addedPorts.length ? "danger" : "muted"} />
                <Delta label="Closed ports" value={`${diff.removedPorts.length}`} tone={diff.removedPorts.length ? "success" : "muted"} />
              </div>
              {diff.addedPorts.length > 0 && <PortList title="Newly open" ports={diff.addedPorts} tone="danger" />}
              {diff.removedPorts.length > 0 && <PortList title="Now closed" ports={diff.removedPorts} tone="success" />}
            </div>
            <Timeline
              items={[
                ...diff.newFindings.map((t) => ({ time: "new", title: t, desc: "New finding", tone: "#f43f5e" })),
                ...diff.resolvedFindings.map((t) => ({ time: "resolved", title: t, desc: "Resolved", tone: "#34d399" })),
              ]}
            />
          </div>
        </Card>
      )}

      {/* Sub-scan launcher: drill into subdomains, paths, IPs */}
      {scan.results && scan.results.subdomains.length > 0 && (
        <SubscanLauncher
          parentId={scan.id}
          subdomains={scan.results.subdomains.map((s) => s.hostname)}
          paths={scan.results.web.discoveredPaths.map((p) => p.path)}
        />
      )}

      {/* Scan tree */}
      {(descendantCount > 0 || scan.parentId) && (
        <Card>
          <SectionTitle
            title="Recon tree"
            subtitle={`${descendantCount + 1} scan(s) in this investigation`}
            icon={<span>🌳</span>}
          />
          <ScanTree scans={tree} rootId={rootId} currentId={scan.id} />
        </Card>
      )}

      {scan.results && <ScanResults scan={scan} />}
    </div>
  );
}

function Delta({ label, value, tone }: { label: string; value: string; tone: "danger" | "success" | "muted" }) {
  const color = tone === "danger" ? "#fb7185" : tone === "success" ? "#34d399" : "#8a97ad";
  return (
    <div className="rounded-lg border border-line bg-white/[0.02] px-3 py-2">
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
      <div className="text-[0.65rem] text-muted">{label}</div>
    </div>
  );
}

function PortList({ title, ports, tone }: { title: string; ports: number[]; tone: "danger" | "success" }) {
  return (
    <div>
      <div className="mb-1 text-xs text-muted">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {ports.map((p) => (
          <span key={p} className="font-mono text-xs" style={{ color: tone === "danger" ? "#fb7185" : "#34d399" }}>{p}</span>
        ))}
      </div>
    </div>
  );
}
