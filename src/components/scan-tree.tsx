"use client";

import Link from "next/link";
import { useState } from "react";
import type { ScanRecord } from "@/lib/types";
import { cn, riskColor } from "@/lib/utils";

// Builds a parent->children map from a flat list of scans.
function buildTree(scans: ScanRecord[], rootId: string): ScanRecord[] {
  const byParent = new Map<string | null, ScanRecord[]>();
  for (const s of scans) {
    const key = s.parentId;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(s);
  }
  const children = byParent.get(rootId) ?? [];
  // Recursively sort + attach is implicit via rendering; we just return roots.
  return children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function countDescendants(scans: ScanRecord[], rootId: string): number {
  const children = scans.filter((s) => s.parentId === rootId);
  return children.length + children.reduce((acc, c) => acc + countDescendants(scans, c.id), 0);
}

export function ScanTree({
  scans,
  rootId,
  currentId,
  depth = 0,
}: {
  scans: ScanRecord[];
  rootId: string;
  currentId: string;
  depth?: number;
}) {
  const children = buildTree(scans, rootId);
  if (depth === 0 && children.length === 0) return null;

  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-line pl-3")}>
      {children.map((child) => (
        <TreeNode key={child.id} scan={child} scans={scans} currentId={currentId} depth={depth} />
      ))}
    </div>
  );
}

function TreeNode({
  scan,
  scans,
  currentId,
  depth,
}: {
  scan: ScanRecord;
  scans: ScanRecord[];
  currentId: string;
  depth: number;
}) {
  const [open, setOpen] = useState(true);
  const isCurrent = scan.id === currentId;
  const childCount = scans.filter((s) => s.parentId === scan.id).length;
  const hasChildren = childCount > 0;

  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        {hasChildren ? (
          <button onClick={() => setOpen((o) => !o)} className="text-xs text-muted hover:text-ink">
            {open ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-3 text-center text-muted">•</span>
        )}
        <span className="text-sm">{scan.label === "ai-subscan" ? "🤖" : scan.label?.includes("subdomain") ? "🌐" : "🔍"}</span>
        <Link
          href={`/dashboard/scans/${scan.id}`}
          className={cn(
            "truncate font-mono text-xs hover:underline",
            isCurrent ? "font-semibold text-brand" : "text-brand/80",
          )}
        >
          {scan.target}
        </Link>
        <span
          className="badge"
          style={scan.status === "completed" ? { color: riskColor(scan.riskScore ?? 100), borderColor: "currentColor" } : {}}
        >
          {scan.status === "completed" ? `${scan.riskScore ?? "—"}` : scan.status}
        </span>
        {scan.label && scan.label !== "ai-subscan" && (
          <span className="hidden text-[0.65rem] text-muted sm:inline">{scan.label}</span>
        )}
      </div>
      {open && hasChildren && (
        <ScanTree scans={scans} rootId={scan.id} currentId={currentId} depth={depth + 1} />
      )}
    </div>
  );
}

export { countDescendants };
