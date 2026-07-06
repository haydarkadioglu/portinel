"use client";

import { useEffect, useState } from "react";
import type { GeoResult, PortResult, ScanResult, Severity } from "@/lib/types";
import { cn, SEVERITY_DOT, riskColor } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Geolocation map — SVG world map with a pulsing marker at the target location
// ---------------------------------------------------------------------------
export function GeoMap({ geo }: { geo: GeoResult }) {
  // Equirectangular projection: lon [-180,180] -> x [0,360], lat [90,-90] -> y [0,180]
  const x = ((geo.lon + 180) / 360) * 360;
  const y = ((90 - geo.lat) / 180) * 180;
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-black/30">
      <svg viewBox="0 0 360 180" className="w-full">
        {/* dotted world grid */}
        <defs>
          <pattern id="dots" width="6" height="6" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" fill="rgba(255,255,255,0.12)" />
          </pattern>
        </defs>
        <rect width="360" height="180" fill="url(#dots)" />
        {/* crude continent silhouettes via opacity blobs */}
        <g fill="rgba(34,211,238,0.06)" stroke="rgba(34,211,238,0.18)" strokeWidth="0.3">
          <path d="M60 50 q20 -15 50 -8 q30 5 30 25 q5 25 -15 35 q-25 8 -45 -5 q-25 -12 -20 -47z" />
          <path d="M150 35 q30 -10 60 5 q15 20 5 35 q-20 15 -45 5 q-30 -15 -20 -45z" />
          <path d="M180 110 q25 -8 40 5 q10 20 -5 35 q-25 10 -35 -10 q-10 -20 0 -35z" />
          <path d="M255 130 q15 -5 25 5 q5 15 -8 20 q-15 3 -20 -8 q-5 -12 3 -17z" />
          <path d="M250 40 q20 -5 35 8 q8 20 -8 30 q-20 8 -30 -8 q-8 -18 3 -30z" />
        </g>
        {/* crosshair lines */}
        <line x1={x} y1="0" x2={x} y2="180" stroke="rgba(34,211,238,0.25)" strokeWidth="0.4" strokeDasharray="2 3" />
        <line x1="0" y1={y} x2="360" y2={y} stroke="rgba(34,211,238,0.25)" strokeWidth="0.4" strokeDasharray="2 3" />
        {/* pulsing marker */}
        <circle cx={x} cy={y} r="3.5" fill="#22d3ee" />
        <circle cx={x} cy={y} r="3.5" fill="none" stroke="#22d3ee" strokeWidth="1">
          <animate attributeName="r" values="3.5;9;3.5" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
      <div className="absolute bottom-2 left-3 rounded-md bg-black/60 px-2 py-1 text-[0.7rem] backdrop-blur">
        <span className="font-semibold text-brand">{geo.city || geo.region}</span>
        <span className="text-muted">, {geo.country} ({geo.countryCode})</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Risk gauge — animated semicircle
// ---------------------------------------------------------------------------
export function RiskGauge({
  score,
  grade,
  label,
  size = 200,
}: {
  score: number;
  grade?: string;
  label?: string;
  size?: number;
}) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setV(score), 150);
    return () => clearTimeout(id);
  }, [score]);

  const r = 85;
  const cx = 100;
  const cy = 100;
  const circ = Math.PI * r;
  const offset = circ * (1 - v / 100);
  const color = riskColor(score);

  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 200 120" className="w-full">
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(0.22,1,0.36,1), stroke 0.6s ease", filter: `drop-shadow(0 0 8px ${color}99)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <div className="text-4xl font-bold leading-none" style={{ color }}>
          {Math.round(v)}
        </div>
        <div className="text-[0.7rem] uppercase tracking-wide text-muted">
          {grade ? `Grade ${grade}` : "/ 100"}
        </div>
        {label && <div className="mt-0.5 text-xs text-muted">{label}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Port heatmap
// ---------------------------------------------------------------------------
export function PortHeatmap({ ports }: { ports: PortResult[] }) {
  const stateColor: Record<string, string> = {
    open: "bg-success/80 shadow-[0_0_10px_rgba(52,211,153,0.4)] text-success",
    filtered: "bg-warning/40 text-warning",
    closed: "bg-white/[0.04] text-faint",
  };
  if (!ports.length)
    return <p className="text-sm text-muted">No port data.</p>;
  return (
    <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8 md:grid-cols-10">
      {ports.map((p) => (
        <div
          key={`${p.port}-${p.protocol}`}
          className={cn(
            "group relative aspect-square rounded-md border border-line p-1 text-center transition",
            stateColor[p.state],
          )}
          title={`${p.port}/${p.protocol} — ${p.state} (${p.service})`}
        >
          <div className="text-[0.6rem] font-semibold leading-none">{p.port}</div>
          <div className="truncate text-[0.5rem] opacity-70">{p.service}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Animated network topology graph
// ---------------------------------------------------------------------------
export function NetworkGraph({ result }: { result: ScanResult }) {
  const openPorts = result.ports.filter((p) => p.state === "open");
  const nodes: { label: string; kind: "port" | "tech" | "sub"; color: string }[] = [];
  for (const p of openPorts.slice(0, 6))
    nodes.push({ label: `${p.port}/${p.service}`, kind: "port", color: "#34d399" });
  for (const t of result.technologies.slice(0, 4))
    nodes.push({ label: t, kind: "tech", color: "#818cf8" });
  for (const s of result.subdomains.slice(0, 3))
    nodes.push({ label: s.hostname, kind: "sub", color: "#22d3ee" });
  const total = Math.max(nodes.length, 1);
  const cx = 200;
  const cy = 200;
  const radius = 140;

  return (
    <div className="relative">
      <svg viewBox="0 0 400 400" className="w-full max-w-md mx-auto">
        <defs>
          <radialGradient id="netcenter" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r="160" fill="url(#netcenter)" />
        <circle cx={cx} cy={cy} r="60" fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 5" className="animate-spin-slow" style={{ transformOrigin: "center" }} />
        {nodes.map((n, i) => {
          const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * radius;
          const y = cy + Math.sin(angle) * radius;
          return (
            <g key={i}>
              <line
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={n.color}
                strokeOpacity="0.35"
                strokeWidth="1.2"
                strokeDasharray="4 6"
                style={{ animation: `dash ${6 + i}s linear infinite` }}
              />
              <circle cx={x} cy={y} r="9" fill={n.color} fillOpacity="0.18" stroke={n.color} strokeWidth="1.5">
                <animate attributeName="r" values="9;11;9" dur={`${3 + (i % 3)}s`} repeatCount="indefinite" />
              </circle>
              <text
                x={x}
                y={y - 14}
                textAnchor="middle"
                fontSize="9"
                fill="#cbd5e1"
                className="font-mono"
              >
                {n.label.length > 14 ? n.label.slice(0, 13) + "…" : n.label}
              </text>
            </g>
          );
        })}
        <circle cx={cx} cy={cy} r="16" fill="#0e1626" stroke="#22d3ee" strokeWidth="2" />
        <circle cx={cx} cy={cy} r="16" fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.5">
          <animate attributeName="r" values="16;30;16" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0;0.5" dur="2.6s" repeatCount="indefinite" />
        </circle>
        <text x={cx} y={cy + 34} textAnchor="middle" fontSize="9" fill="#8a97ad" className="font-mono">
          {result.meta.normalizedTarget.slice(0, 22)}
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-3 text-[0.7rem] text-muted">
        <Legend color="#34d399" label="Open port" />
        <Legend color="#818cf8" label="Technology" />
        <Legend color="#22d3ee" label="Subdomain" />
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Findings donut
// ---------------------------------------------------------------------------
export function FindingsDonut({
  counts,
}: {
  counts: Record<Severity, number>;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const r = 60;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const order: Severity[] = ["critical", "high", "medium", "low", "info"];
  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 160 160" className="h-36 w-36">
        <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="16" />
        {total === 0 && (
          <text x="80" y="84" textAnchor="middle" fontSize="13" fill="#8a97ad">
            No issues
          </text>
        )}
        {order.map((sev) => {
          const value = counts[sev];
          if (!value) return null;
          const frac = value / total;
          const dash = frac * circ;
          const seg = (
            <circle
              key={sev}
              cx="80"
              cy="80"
              r={r}
              fill="none"
              stroke={SEVERITY_DOT[sev]}
              strokeWidth="16"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-acc}
              transform="rotate(-90 80 80)"
              style={{ transition: "stroke-dasharray 0.8s ease" }}
            />
          );
          acc += dash;
          return seg;
        })}
        <text x="80" y="76" textAnchor="middle" fontSize="26" fontWeight="700" fill="#e8edf6">
          {total}
        </text>
        <text x="80" y="96" textAnchor="middle" fontSize="9" fill="#8a97ad" className="uppercase">
          findings
        </text>
      </svg>
      <div className="space-y-1.5">
        {order.map((sev) => (
          <div key={sev} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEVERITY_DOT[sev] }} />
            <span className="capitalize text-muted">{sev}</span>
            <span className="ml-auto font-semibold">{counts[sev]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart
// ---------------------------------------------------------------------------
export function BarChart({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted">{d.label}</span>
            <span className="font-semibold">{d.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(d.value / max) * 100}%`,
                background: d.color,
                transition: "width 0.9s cubic-bezier(0.22,1,0.36,1)",
                animation: `fade-in 0.5s ease ${i * 0.08}s both`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vertical timeline
// ---------------------------------------------------------------------------
export function Timeline({
  items,
}: {
  items: { time: string; title: string; desc?: string; tone?: string }[];
}) {
  return (
    <div className="relative pl-5">
      <div className="absolute left-[5px] top-1 h-full w-px bg-line" />
      {items.map((it, i) => (
        <div key={i} className="relative mb-5 last:mb-0" style={{ animation: "fade-up 0.4s ease both", animationDelay: `${i * 0.05}s` }}>
          <span
            className="absolute -left-[18px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-base"
            style={{ background: it.tone || "#22d3ee" }}
          />
          <div className="text-[0.7rem] text-muted">{it.time}</div>
          <div className="text-sm font-medium">{it.title}</div>
          {it.desc && <div className="text-xs text-muted">{it.desc}</div>}
        </div>
      ))}
    </div>
  );
}
