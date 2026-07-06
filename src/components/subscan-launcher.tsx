"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export function SubscanLauncher({
  parentId,
  subdomains,
  paths,
}: {
  parentId: string;
  subdomains: string[];
  paths: string[];
}) {
  const router = useRouter();
  const [scanning, setScanning] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"subdomains" | "paths">("subdomains");

  async function launchSubscan(target: string, label: string) {
    setScanning(target);
    setError("");
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target,
          scanTypes: ["quick", "ssl", "http", "web"],
          parentId,
          label,
        }),
      });
      const data = await res.json();
      if (res.ok && data.scan?.id) {
        router.push(`/dashboard/scans/${data.scan.id}`);
      } else {
        setError(data.error || "Failed to launch sub-scan");
      }
    } catch {
      setError("Network error");
    }
    setScanning(null);
  }

  async function launchAll() {
    const targets = mode === "subdomains" ? subdomains : paths;
    if (!targets.length) return;
    if (!confirm(`Launch ${Math.min(targets.length, 5)} sub-scans? (first 5)`)) return;
    setScanning("all");
    for (const t of targets.slice(0, 5)) {
      await launchSubscan(t, mode === "subdomains" ? "subdomain" : "web-path");
    }
  }

  const list = mode === "subdomains" ? subdomains : paths.slice(0, 30);

  return (
    <div className="panel p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Drill deeper</h3>
          <div className="flex gap-1.5">
            <button
              onClick={() => setMode("subdomains")}
              data-active={mode === "subdomains"}
              className="chip !text-[0.7rem]"
              disabled={!subdomains.length}
            >
              🌐 Subdomains ({subdomains.length})
            </button>
            <button
              onClick={() => setMode("paths")}
              data-active={mode === "paths"}
              className="chip !text-[0.7rem]"
              disabled={!paths.length}
            >
              📁 Paths ({paths.length})
            </button>
          </div>
        </div>
        {list.length > 1 && (
          <button onClick={launchAll} disabled={scanning === "all"} className="btn btn-primary !py-1.5 !text-xs">
            {scanning === "all" ? <Spinner className="h-3.5 w-3.5" /> : "⚡ Scan first 5"}
          </button>
        )}
      </div>

      {error && <div className="mb-2 text-sm text-danger">{error}</div>}

      <div className="flex flex-wrap gap-1.5">
        {list.slice(0, 40).map((item) => (
          <button
            key={item}
            onClick={() => launchSubscan(item, mode === "subdomains" ? "subdomain" : "web-path")}
            disabled={scanning !== null}
            className={cn(
              "group inline-flex items-center gap-1.5 rounded-lg border border-line bg-white/[0.02] px-2.5 py-1.5 text-xs transition hover:border-brand/40 hover:bg-brand/5",
            )}
          >
            <code className="font-mono text-brand/80">{item}</code>
            <span className="text-muted transition group-hover:text-brand">
              {scanning === item ? <Spinner className="h-3 w-3" /> : "→"}
            </span>
          </button>
        ))}
        {list.length > 40 && <span className="self-center text-xs text-muted">+{list.length - 40} more</span>}
      </div>
      <p className="mt-3 text-[0.7rem] text-muted">
        💡 Sub-scans run as children of this scan and appear in the recon tree. Ask the AI assistant to
        launch them too — e.g. <em>&quot;scan the most interesting subdomains&quot;</em>.
      </p>
    </div>
  );
}
