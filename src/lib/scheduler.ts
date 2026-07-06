// ============================================================================
// scheduler.ts — Background scheduler for recurring scans.
//
// Runs an interval that picks up scheduled scans whose nextRunAt has elapsed,
// creates a fresh scan record for them, and hands it to the async worker.
// The handle is unref'd so it never blocks process shutdown. In a multi-
// instance deployment, guard this with a distributed lock (e.g. Redis).
// ============================================================================
import { randomUUID } from "crypto";
import { db } from "@/db";
import { scans, scheduledScans } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { runScanWorker } from "./scan-service";
import { coerceScanTypes } from "./validation";
import type { ScanType } from "./types";

const FREQUENCY_MS: Record<string, number> = {
  daily: 86_400_000,
  weekly: 7 * 86_400_000,
  monthly: 30 * 86_400_000,
};

let started = false;

export function startScheduler(): void {
  if (started) return;
  started = true;

  const tick = async () => {
    try {
      const due = await db
        .select()
        .from(scheduledScans)
        .where(
          and(eq(scheduledScans.enabled, true), lte(scheduledScans.nextRunAt, new Date())),
        )
        .limit(5);

      for (const job of due) {
        const interval = FREQUENCY_MS[job.frequency] ?? FREQUENCY_MS.weekly;
        await db
          .update(scheduledScans)
          .set({ lastRunAt: new Date(), nextRunAt: new Date(Date.now() + interval) })
          .where(eq(scheduledScans.id, job.id));

        const [row] = await db
          .insert(scans)
          .values({
            userId: job.userId,
            target: job.target,
            targetType: "domain",
            scanTypes: coerceScanTypes(job.scanTypes),
            status: "queued",
            shareToken: randomUUID().replace(/-/g, ""),
          })
          .returning();

        void runScanWorker(row.id, job.userId, {
          target: job.target,
          scanTypes: coerceScanTypes(job.scanTypes) as ScanType[],
        });
      }
    } catch (err) {
      console.error("[scheduler] tick failed:", err);
    }
  };

  void tick();
  const handle = setInterval(() => void tick(), 60_000);
  if (typeof (handle as { unref?: () => void }).unref === "function") {
    (handle as { unref: () => void }).unref();
  }
}

export function computeNextRun(frequency: string): Date {
  const ms = FREQUENCY_MS[frequency] ?? FREQUENCY_MS.weekly;
  return new Date(Date.now() + ms);
}
