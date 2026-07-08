import { NextRequest } from "next/server";
import { subscribe, getProgress, type ScanProgress } from "@/lib/scan-events";
import { getScan, runScanWorker, inFlight } from "@/lib/scan-service";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Server-Sent Events stream for live scan progress.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await params;
  const scan = await getScan(id, user.id);
  if (!scan) {
    return new Response("Not found", { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(timeout);
      };
      const send = (p: ScanProgress) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(p)}\n\n`));
        } catch {
          cleanup();
          return;
        }
        if (p.status === "completed" || p.status === "failed") {
          cleanup();
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };

      // Immediately flush the last known state (for late joiners).
      const current = getProgress(id);
      if (current) send(current);
      else
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ scanId: id, status: "queued", stage: "init", message: "Waiting for worker…", progress: 0, updatedAt: Date.now() })}\n\n`,
          ),
        );

      // Trigger the worker if the scan is queued and not already running
      if (scan.status === "queued" && !inFlight.has(id)) {
        void runScanWorker(id, user.id, {
          target: scan.target,
          scanTypes: scan.scanTypes,
        }).catch((err) => {
          console.error(`[scan ${id}] stream worker crashed:`, err);
        });
      }

      const unsubscribe = subscribe(id, send);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15000);

      const timeout = setTimeout(() => {
        cleanup();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, 90_000);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
