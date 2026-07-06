import { NextRequest } from "next/server";
import { subscribe, getProgress, type ScanProgress } from "@/lib/scan-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Server-Sent Events stream for live scan progress.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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
