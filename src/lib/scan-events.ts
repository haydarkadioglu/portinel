// ============================================================================
// scan-events.ts — In-memory progress & lifecycle event bus for scans.
//
// A lightweight pub/sub used by the async scan worker to publish real-time
// progress, and by the SSE endpoint to stream it to connected clients.
// Swap for Redis pub/sub to scale across multiple instances.
// ============================================================================
import { EventEmitter } from "events";

export type ScanStatus = "queued" | "running" | "completed" | "failed";

export interface ScanProgress {
  scanId: string;
  status: ScanStatus;
  stage: string;
  message: string;
  progress: number; // 0..100
  updatedAt: number;
}

const bus = new EventEmitter();
bus.setMaxListeners(1000);

// Live snapshot of the latest progress per scan (for late-joining clients).
const latest = new Map<string, ScanProgress>();

export function publishProgress(p: ScanProgress): void {
  latest.set(p.scanId, p);
  bus.emit(`scan:${p.scanId}`, p);
  if (p.status === "completed" || p.status === "failed") {
    // Keep final state briefly, then clean up.
    setTimeout(() => latest.delete(p.scanId), 120_000);
  }
}

export function getProgress(scanId: string): ScanProgress | undefined {
  return latest.get(scanId);
}

export function subscribe(
  scanId: string,
  listener: (p: ScanProgress) => void,
): () => void {
  const channel = `scan:${scanId}`;
  bus.on(channel, listener);
  return () => bus.off(channel, listener);
}

export function setStatus(scanId: string, status: ScanStatus, message?: string): void {
  const prev = latest.get(scanId);
  publishProgress({
    scanId,
    status,
    stage: prev?.stage ?? "init",
    message: message ?? (status === "queued" ? "Queued for scanning" : status),
    progress: prev?.progress ?? 0,
    updatedAt: Date.now(),
  });
}
