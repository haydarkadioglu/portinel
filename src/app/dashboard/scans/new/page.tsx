"use client";

import { useState, useEffect, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { SCAN_TYPE_OPTIONS } from "@/lib/validation";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function NewScanPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [target, setTarget] = useState(params.get("target") || "");
  const [selected, setSelected] = useState<string[]>(["quick"]);
  const [intensity, setIntensity] = useState("normal");
  const [ports, setPorts] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Live progress state
  const [progress, setProgress] = useState(0);
  const [stageLabel, setStageLabel] = useState("");
  const [scanId, setScanId] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : [...s, id],
    );
  }
  function preset(name: string) {
    if (name === "quick") setSelected(["quick"]);
    if (name === "deep") setSelected(["deep"]);
    if (name === "stealth") setSelected(["stealth"]);
  }

  // Subscribe to live progress via SSE once we have a scan id.
  useEffect(() => {
    if (!scanId) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/scans/${scanId}/stream`);
    } catch {
      router.push(`/dashboard/scans/${scanId}`);
      return;
    }
    es.onmessage = (ev) => {
      try {
        const p = JSON.parse(ev.data) as {
          status: string;
          stage: string;
          message: string;
          progress: number;
        };
        setProgress(p.progress);
        setStageLabel(p.message || p.stage);
        if (p.status === "completed") {
          es?.close();
          router.push(`/dashboard/scans/${scanId}`);
        } else if (p.status === "failed") {
          es?.close();
          setError(p.message || "Scan failed.");
          setLoading(false);
        }
      } catch {
        /* ignore malformed */
      }
    };
    es.onerror = () => {
      es?.close();
      // Fallback: give the worker a moment, then take the user to the result.
      setTimeout(() => router.push(`/dashboard/scans/${scanId}`), 2000);
    };
    return () => es?.close();
  }, [scanId, router]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setProgress(0);
    setLoading(true);
    try {
      const res = await fetch("/api/scans", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target,
          scanTypes: selected,
          intensity,
          ports: ports || undefined,
        }),
      });
      let data: { error?: string; scan?: { id: string } } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }
      if (!res.ok || !data.scan?.id) {
        setError(data.error || `Request failed (${res.status}).`);
        setLoading(false);
        return;
      }
      setScanId(data.scan.id);
    } catch {
      setError("Could not reach the server. Check your connection.");
      setLoading(false);
    }
  }

  if (loading) {
    return <LiveProgress target={target} progress={progress} stageLabel={stageLabel} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New reconnaissance scan</h1>
        <p className="text-sm text-muted">Define a target and select the intelligence modules to run.</p>
      </div>

      <form onSubmit={onSubmit} className="panel space-y-6 p-6">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted">Target</label>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. example.com · 8.8.8.8 · 192.168.1.0/24"
            className="input font-mono"
            required
          />
          <p className="mt-1.5 text-xs text-muted">Supports domains, hostnames, IPv4 addresses and CIDR ranges.</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-muted">Scan modules</label>
            <div className="flex gap-1.5">
              {["quick", "deep", "stealth"].map((p) => (
                <button key={p} type="button" onClick={() => preset(p)} className="rounded-md border border-line px-2 py-0.5 text-[0.7rem] capitalize text-muted transition hover:border-brand/40 hover:text-brand">
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {SCAN_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                data-active={selected.includes(opt.id)}
                onClick={() => toggle(opt.id)}
                className="chip justify-start !rounded-lg !px-3 !py-2.5 text-left"
              >
                <span className="text-base">{opt.icon}</span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold">{opt.label}</span>
                  <span className="block truncate text-[0.65rem] text-muted">{opt.description}</span>
                </span>
              </button>
            ))}
          </div>
        </div>

        <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="text-xs font-semibold text-brand">
          {showAdvanced ? "− Hide" : "+ Show"} advanced options
        </button>
        {showAdvanced && (
          <div className="space-y-4 rounded-xl border border-line bg-black/20 p-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Intensity</label>
              <div className="flex gap-2">
                {["light", "normal", "aggressive"].map((i) => (
                  <button key={i} type="button" data-active={intensity === i} onClick={() => setIntensity(i)} className="chip flex-1 justify-center capitalize">
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">Specific ports (optional)</label>
              <input value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="e.g. 22,80,443 or 1-1000" className="input font-mono" />
            </div>
          </div>
        )}

        {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary flex-1">Launch scan</button>
          <Link href="/dashboard/scans" className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}

const STAGES = [
  { at: 4, label: "Resolving DNS records", icon: "🌐" },
  { at: 12, label: "Enumerating ports & services", icon: "🔌" },
  { at: 56, label: "Analyzing TLS certificates", icon: "🔒" },
  { at: 68, label: "Fingerprinting HTTP stack", icon: "📡" },
  { at: 82, label: "Discovering subdomains", icon: "🕸️" },
  { at: 92, label: "Scoring risk & generating report", icon: "🧠" },
];

function LiveProgress({ target, progress, stageLabel }: { target: string; progress: number; stageLabel: string }) {
  const currentStage = [...STAGES].reverse().find((s) => progress >= s.at) ?? STAGES[0];
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-lg place-items-center">
      <div className="w-full text-center">
        <div className="relative mx-auto mb-8 h-32 w-32">
          {[1, 2, 3].map((i) => (
            <div key={i} className="absolute inset-0 rounded-full border border-brand/20" style={{ transform: `scale(${i / 3})` }} />
          ))}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: "conic-gradient(from 0deg, rgba(34,211,238,0.5), transparent 35%)",
              animation: "radar 2s linear infinite",
              maskImage: "radial-gradient(circle, #000 55%, transparent 70%)",
              WebkitMaskImage: "radial-gradient(circle, #000 55%, transparent 70%)",
            }}
          />
          <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_16px_#22d3ee]" />
        </div>
        <h2 className="text-xl font-bold">Scanning {target}</h2>
        <p className="mt-1 text-sm text-muted">{stageLabel || currentStage.label}</p>

        {/* Real progress bar */}
        <div className="mx-auto mt-6 max-w-sm">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span>{currentStage.icon} {currentStage.label}</span>
            <span className="font-mono text-brand">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand to-accent transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mx-auto mt-6 max-w-xs space-y-1.5 text-left">
          {STAGES.map((s) => {
            const done = progress > s.at + 4;
            const active = !done && progress >= s.at;
            return (
              <div key={s.label} className={cn("flex items-center gap-2 text-sm transition", done ? "text-ink" : active ? "text-brand" : "text-faint")}>
                <span className={cn("grid h-4 w-4 place-items-center rounded-full border text-[0.6rem]", done ? "border-success bg-success/20 text-success" : active ? "border-brand" : "border-line")}>
                  {done ? "✓" : active ? <Spinner className="h-2.5 w-2.5" /> : ""}
                </span>
                {s.label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
