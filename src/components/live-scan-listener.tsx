"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

export function LiveScanListener({ scanId, initialStatus }: { scanId: string; initialStatus: string }) {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState(initialStatus === "queued" ? "Waiting for worker..." : "Scanning...");

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/scans/${scanId}/stream`);
      es.onmessage = (ev) => {
        try {
          const p = JSON.parse(ev.data) as {
            status: string;
            message: string;
            progress: number;
          };
          setProgress(p.progress);
          setMessage(p.message || "Scanning...");
          
          if (p.status === "completed" || p.status === "failed") {
            es?.close();
            router.refresh();
          }
        } catch {
          // ignore malformed
        }
      };
      es.onerror = () => {
        es?.close();
      };
    } catch {
      // ignore
    }
    return () => es?.close();
  }, [scanId, router]);

  return (
    <div className="panel p-6 max-w-xl mx-auto text-center space-y-4 my-8 animate-fade-up">
      <div className="relative mx-auto h-20 w-20">
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "conic-gradient(from 0deg, rgba(34,211,238,0.5), transparent 35%)",
            animation: "radar 2s linear infinite",
            maskImage: "radial-gradient(circle, #000 55%, transparent 70%)",
            WebkitMaskImage: "radial-gradient(circle, #000 55%, transparent 70%)",
          }}
        />
        <div className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_12px_#22d3ee]" />
      </div>

      <div className="space-y-1">
        <h3 className="font-semibold text-base">Scan in progress</h3>
        <p className="text-xs text-muted font-mono">{message}</p>
      </div>

      <div className="max-w-xs mx-auto">
        <div className="flex justify-between text-[0.65rem] text-muted mb-1">
          <span>Progress</span>
          <span className="font-mono text-brand">{progress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
