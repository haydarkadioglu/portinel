// ============================================================================
// scan-service.ts — Scan orchestration: validate → scan → analyze → persist.
// Acts as the application layer over the scanner engine and analysis engine.
// ============================================================================
import { randomUUID } from "crypto";
import { db } from "@/db";
import { scans, users } from "@/db/schema";
import { eq, desc, and, sql, ilike } from "drizzle-orm";
import { runScan } from "./scanner";
import { analyze } from "./ai";
import { parseTarget } from "./validation";
import { publishProgress, setStatus } from "./scan-events";
import { checkAndNotify } from "./notifications";
import { fireWebhooksForScan } from "./webhooks";
import type { ScanRecord, ScanResult, ScanType, TargetType } from "./types";

const OVERALL_TIMEOUT_MS = 50_000;

export function toScanRecord(row: typeof scans.$inferSelect): ScanRecord {
  return {
    id: row.id,
    userId: row.userId,
    target: row.target,
    targetType: row.targetType as TargetType,
    scanTypes: row.scanTypes as ScanType[],
    status: row.status as ScanRecord["status"],
    riskScore: row.riskScore,
    grade: row.grade,
    openPortCount: row.openPortCount,
    results: (row.results as ScanResult | null) ?? null,
    error: row.error,
    shareToken: row.shareToken,
    durationMs: row.durationMs,
    parentId: row.parentId,
    rootId: row.rootId,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

function withOverallTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error("Scan exceeded the maximum allowed duration.")),
      OVERALL_TIMEOUT_MS,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export interface CreateScanInput {
  target: string;
  scanTypes: ScanType[];
  ports?: string;
  intensity?: "light" | "normal" | "aggressive";
  parentId?: string;
  label?: string;
}

// Track in-flight scans to avoid duplicate concurrent workers for the same id.
const inFlight = new Set<string>();

export async function createScan(
  userId: string,
  input: CreateScanInput,
): Promise<ScanRecord> {
  const parsed = parseTarget(input.target);
  if (!parsed.ok || !parsed.target)
    throw new ServiceError(parsed.error || "Invalid target.", 400);

  // Resolve tree pointers: a sub-scan's rootId is its parent's rootId (or parent id).
  let rootId: string | null = null;
  if (input.parentId) {
    const [parent] = await db.select({ rootId: scans.rootId, id: scans.id }).from(scans).where(eq(scans.id, input.parentId)).limit(1);
    if (parent) rootId = parent.rootId || parent.id;
  }

  const [row] = await db
    .insert(scans)
    .values({
      userId,
      target: parsed.target.value,
      targetType: parsed.target.type,
      scanTypes: input.scanTypes,
      status: "queued",
      shareToken: randomUUID().replace(/-/g, ""),
      parentId: input.parentId ?? null,
      rootId,
      label: input.label ?? null,
    })
    .returning();

  setStatus(row.id, "queued", "Queued for scanning");

  // Fire-and-forget: kick off the worker without awaiting so the request
  // returns immediately (HTTP 202). The worker streams progress via SSE.
  void runScanWorker(row.id, userId, input).catch((err) => {
    console.error(`[scan ${row.id}] worker crashed:`, err);
    setStatus(row.id, "failed", err instanceof Error ? err.message : "Worker crashed");
  });

  const [created] = await db
    .select()
    .from(scans)
    .where(eq(scans.id, row.id))
    .limit(1);
  return toScanRecord(created);
}

// Background worker that executes a scan and persists the result.
export async function runScanWorker(
  scanId: string,
  userId: string,
  input: CreateScanInput,
): Promise<void> {
  if (inFlight.has(scanId)) return;
  inFlight.add(scanId);
  setStatus(scanId, "running", "Initializing scan");
  try {
    const raw = await withOverallTimeout(
      runScan({
        target: input.target,
        scanTypes: input.scanTypes,
        ports: input.ports,
        intensity: input.intensity,
        onProgress: (_stage, message, progress) =>
          publishProgress({ scanId, status: "running", stage: _stage, message, progress, updatedAt: Date.now() }),
      }),
    );
    publishProgress({ scanId, status: "running", stage: "analysis", message: "Generating AI report", progress: 97, updatedAt: Date.now() });
    const { ai, risk } = analyze(raw);
    const result: ScanResult = { ...raw, ai, risk };
    const openPortCount = raw.ports.filter((p) => p.state === "open").length;

    await db
      .update(scans)
      .set({
        status: "completed",
        results: result,
        riskScore: risk.score,
        grade: risk.grade,
        openPortCount,
        durationMs: raw.meta.durationMs,
        completedAt: new Date(),
      })
      .where(eq(scans.id, scanId));
    await db
      .update(users)
      .set({ scanCount: sql`${users.scanCount} + 1` })
      .where(eq(users.id, userId));

    // Generate diff-based notifications (port changes, cert expiry, risk delta).
    await checkAndNotify(scanId, userId).catch(() => {});

    // Fire external webhooks (Slack/Discord/custom).
    await fireWebhooksForScan({
      id: scanId,
      userId,
      target: input.target,
      targetType: "domain",
      scanTypes: input.scanTypes,
      status: "completed",
      riskScore: risk.score,
      grade: risk.grade,
      openPortCount,
      results: result,
      error: null,
      shareToken: null,
      durationMs: raw.meta.durationMs,
      parentId: input.parentId ?? null,
      rootId: null,
      label: input.label ?? null,
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    }).catch(() => {});

    publishProgress({ scanId, status: "completed", stage: "done", message: "Scan complete", progress: 100, updatedAt: Date.now() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed unexpectedly.";
    await db
      .update(scans)
      .set({ status: "failed", error: message, completedAt: new Date() })
      .where(eq(scans.id, scanId));
    publishProgress({ scanId, status: "failed", stage: "error", message, progress: 0, updatedAt: Date.now() });
  } finally {
    inFlight.delete(scanId);
  }
}

export async function listScans(
  userId: string,
  opts: { limit?: number; offset?: number; target?: string } = {},
): Promise<ScanRecord[]> {
  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  let query = db
    .select()
    .from(scans)
    .where(eq(scans.userId, userId))
    .orderBy(desc(scans.createdAt))
    .limit(limit)
    .offset(offset)
    .$dynamic();
  if (opts.target) {
    query = query.where(ilike(scans.target, `%${opts.target}%`));
  }
  const rows = await query;
  return rows.map(toScanRecord);
}

export async function getScan(
  id: string,
  userId: string,
): Promise<ScanRecord | null> {
  const [row] = await db
    .select()
    .from(scans)
    .where(and(eq(scans.id, id), eq(scans.userId, userId)))
    .limit(1);
  return row ? toScanRecord(row) : null;
}

export async function getScanByShareToken(
  token: string,
): Promise<ScanRecord | null> {
  const [row] = await db
    .select()
    .from(scans)
    .where(eq(scans.shareToken, token))
    .limit(1);
  return row ? toScanRecord(row) : null;
}

export interface ScanDiff {
  before: ScanRecord;
  after: ScanRecord;
  addedPorts: number[];
  removedPorts: number[];
  riskDelta: number;
  newFindings: string[];
  resolvedFindings: string[];
}

export function diffScans(before: ScanRecord, after: ScanRecord): ScanDiff {
  const beforePorts = new Set(
    (before.results?.ports ?? [])
      .filter((p) => p.state === "open")
      .map((p) => p.port),
  );
  const afterPorts = (after.results?.ports ?? [])
    .filter((p) => p.state === "open")
    .map((p) => p.port);
  const addedPorts = afterPorts.filter((p) => !beforePorts.has(p));
  const removedPorts = [...beforePorts].filter((p) => !afterPorts.includes(p));
  const beforeTitles = new Set(
    (before.results?.findings ?? []).map((f) => f.title),
  );
  const afterTitles = new Set(
    (after.results?.findings ?? []).map((f) => f.title),
  );
  return {
    before,
    after,
    addedPorts,
    removedPorts,
    riskDelta: (after.riskScore ?? 0) - (before.riskScore ?? 0),
    newFindings: [...afterTitles].filter((t) => !beforeTitles.has(t)),
    resolvedFindings: [...beforeTitles].filter((t) => !afterTitles.has(t)),
  };
}

/** Fetch the full scan tree for a root scan (the scan + all descendants). */
export async function getScanTree(rootOrScanId: string, userId: string): Promise<ScanRecord[]> {
  // First, resolve the actual root id.
  const [self] = await db
    .select({ id: scans.id, rootId: scans.rootId, parentId: scans.parentId, userId: scans.userId })
    .from(scans)
    .where(eq(scans.id, rootOrScanId))
    .limit(1);
  if (!self || self.userId !== userId) return [];
  const rootId = self.rootId || self.id;
  // All scans sharing this rootId + the root itself.
  const rows = await db
    .select()
    .from(scans)
    .where(and(eq(scans.rootId, rootId), eq(scans.userId, userId)));
  // Also include the root scan itself (rootId is null for the root).
  const [root] = await db.select().from(scans).where(and(eq(scans.id, rootId), eq(scans.userId, userId))).limit(1);
  const all = root ? [root, ...rows] : rows;
  return all.map(toScanRecord);
}

export class ServiceError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}
