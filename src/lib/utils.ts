import type { Severity } from "./types";

export function cn(
  ...classes: (string | false | null | undefined)[]
): string {
  return classes.filter(Boolean).join(" ");
}

export function timeAgo(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  const diff = Date.now() - date.getTime();
  const sec = Math.round(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.round(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

export function formatDateTime(input: string | Date): string {
  const date = typeof input === "string" ? new Date(input) : input;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatNum(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

export const SEVERITY_CLASS: Record<Severity, string> = {
  critical: "sev-critical",
  high: "sev-high",
  medium: "sev-medium",
  low: "sev-low",
  info: "sev-info",
};

export const SEVERITY_DOT: Record<Severity, string> = {
  critical: "#f43f5e",
  high: "#fb7185",
  medium: "#fbbf24",
  low: "#34d399",
  info: "#94a3b8",
};

export const SEVERITY_ORDER: Severity[] = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
];

export function riskColor(score: number): string {
  if (score >= 80) return "#34d399";
  if (score >= 65) return "#fbbf24";
  if (score >= 45) return "#fb923c";
  return "#f43f5e";
}

export function riskGradient(score: number): [string, string] {
  if (score >= 80) return ["#34d399", "#22d3ee"];
  if (score >= 65) return ["#fbbf24", "#34d399"];
  if (score >= 45) return ["#fb923c", "#fbbf24"];
  return ["#f43f5e", "#fb7185"];
}
