import Link from "next/link";
import type { ReactNode } from "react";
import { cn, SEVERITY_CLASS } from "@/lib/utils";
import type { Severity } from "@/lib/types";

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        className="drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]"
      >
        <defs>
          <linearGradient id="rxg" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#22d3ee" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <path
          d="M20 2L36 11v18L20 38 4 29V11L20 2z"
          stroke="url(#rxg)"
          strokeWidth="2"
          fill="rgba(34,211,238,0.06)"
        />
        <path
          d="M14 27l5-7 4 4 4-9"
          stroke="url(#rxg)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="14" cy="27" r="2" fill="#22d3ee" />
        <circle cx="27" cy="15" r="2" fill="#818cf8" />
      </svg>
      <span className="text-lg font-bold tracking-tight">
        Port<span className="text-gradient">inel</span>
      </span>
    </div>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={cn("badge", SEVERITY_CLASS[severity])}>
      {severity}
    </span>
  );
}

export function Card({
  children,
  className,
  hover,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div className={cn("panel p-5", hover && "panel-hover", className)}>
      {children}
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  icon,
  action,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <div className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white/[0.03] text-brand">
            {icon}
          </div>
        )}
        <div>
          <h3 className="font-semibold leading-tight">{title}</h3>
          {subtitle && (
            <p className="text-xs text-muted">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  icon,
  accent = "brand",
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
  accent?: "brand" | "success" | "warning" | "danger" | "accent";
}) {
  const accentMap = {
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-danger",
    accent: "text-accent",
  } as const;
  return (
    <div className="panel panel-hover p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        {icon && (
          <span className={cn("text-lg", accentMap[accent])}>{icon}</span>
        )}
      </div>
      <div className="mt-2 text-3xl font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center px-6 py-16 text-center">
      {icon && (
        <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-line bg-white/[0.03] text-2xl text-brand">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.2"
      />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Avatar({
  name,
  color,
  size = 36,
}: {
  name: string;
  color?: string | null;
  size?: number;
}) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-semibold"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${color || "#22d3ee"}, ${color ? color + "99" : "#6366f1"})`,
        fontSize: size * 0.38,
        color: "#04070e",
      }}
    >
      {initials}
    </div>
  );
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "brand";
}) {
  const tones = {
    default: "border-line text-muted",
    success: "sev-low",
    warning: "sev-medium",
    danger: "sev-critical",
    brand: "text-brand border-brand/30 bg-brand/10",
  } as const;
  return <span className={cn("badge", tones[tone])}>{children}</span>;
}

export function MonoLabel({ children }: { children: ReactNode }) {
  return (
    <code
      className="rounded-md border border-line bg-black/30 px-1.5 py-0.5 font-mono text-[0.78em] text-brand"
      style={{ fontFamily: "var(--font-jetbrains), monospace" }}
    >
      {children}
    </code>
  );
}
