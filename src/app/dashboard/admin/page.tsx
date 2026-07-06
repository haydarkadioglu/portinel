"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { AiProvidersPanel } from "@/components/ai-providers-panel";
import { UserManager } from "@/components/user-manager";
import { timeAgo, riskColor } from "@/lib/utils";

type Stats = {
  totals: { users: number; scans: number; completed: number; avgRisk: number };
  topTargets: { target: string; count: number }[];
  statusBreakdown: { status: string; count: number }[];
};
type UserRow = {
  id: string; email: string; name: string; role: string; plan: string;
  status: string; company: string | null; scanCount: number;
  createdAt: string; lastLoginAt: string | null;
};
type ScanRow = {
  id: string; target: string; status: string; riskScore: number | null;
  grade: string | null; openPortCount: number; createdAt: string; userEmail: string | null;
};
type LogRow = {
  id: string; action: string; status: string; ip: string | null;
  createdAt: string; userEmail: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  completed: "#34d399", failed: "#f43f5e", running: "#fbbf24", queued: "#8a97ad",
};

export default function AdminPage() {
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [scans, setScans] = useState<ScanRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
      fetch("/api/admin/scans").then((r) => r.json()),
      fetch("/api/admin/audit").then((r) => r.json()),
    ])
      .then(([s, u, sc, l]) => {
        setStats(s); setUsers(u.users ?? []); setScans(sc.scans ?? []); setLogs(l.logs ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function updateUser(id: string, patch: Partial<UserRow>) {
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  }
  async function deleteUser(id: string) {
    if (!confirm("Delete this user and all their scans?")) return;
    await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setUsers((us) => us.filter((u) => u.id !== id));
  }

  if (loading)
    return <div className="flex justify-center py-20 text-muted"><Spinner className="h-6 w-6" /></div>;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin panel</h1>
        <p className="text-sm text-muted">Platform administration & monitoring.</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-line">
        {["overview", "users", "scans", "audit", "ai"].map((t) => (
          t === "ai" ? <button key="ai" onClick={() => setTab("ai")} className={`relative px-3.5 py-2.5 text-sm font-medium transition ${tab === "ai" ? "text-brand" : "text-muted hover:text-ink"}`}>
            🤖 AI Providers
            {tab === "ai" && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button> : <button key={t} onClick={() => setTab(t)} className={`relative px-3.5 py-2.5 text-sm font-medium capitalize transition ${tab === t ? "text-brand" : "text-muted hover:text-ink"}`}>
            {t}
            {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brand" />}
          </button>
        ))}
      </div>

      {tab === "ai" && <AiProvidersPanel />}

      {tab === "overview" && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Users" value={stats.totals.users} icon="👥" />
            <Stat label="Total scans" value={stats.totals.scans} icon="🛰️" />
            <Stat label="Completed" value={stats.totals.completed} icon="✅" />
            <Stat label="Avg risk" value={stats.totals.avgRisk} icon="📈" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="panel p-5">
              <h3 className="mb-4 font-semibold">Scan status breakdown</h3>
              <BarChart data={stats.statusBreakdown.map((s) => ({ label: s.status, value: s.count, color: STATUS_COLORS[s.status] || "#8a97ad" }))} />
            </div>
            <div className="panel p-5">
              <h3 className="mb-4 font-semibold">Top targets</h3>
              <BarChart data={stats.topTargets.map((t, i) => ({ label: t.target, value: t.count, color: ["#22d3ee", "#6366f1", "#a855f7", "#34d399", "#fbbf24", "#fb7185"][i % 6] }))} />
            </div>
          </div>
        </div>
      )}

      {tab === "users" && <UserManager />}

      {tab === "scans" && (
        <div className="panel overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-4 py-3">Target</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Risk</th><th className="px-4 py-3">When</th>
            </tr></thead>
            <tbody>
              {scans.map((s) => (
                <tr key={s.id} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs text-brand">{s.target}</td>
                  <td className="px-4 py-3 text-muted">{s.userEmail || "—"}</td>
                  <td className="px-4 py-3"><span style={{ color: STATUS_COLORS[s.status] }}>{s.status}</span></td>
                  <td className="px-4 py-3 font-semibold" style={{ color: riskColor(s.riskScore ?? 100) }}>{s.riskScore ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted">{timeAgo(s.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="panel overflow-x-auto !p-0">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-4 py-3">Action</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">IP</th><th className="px-4 py-3">When</th>
            </tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-line/40 last:border-0">
                  <td className="px-4 py-3 font-mono text-xs">{l.action}</td>
                  <td className="px-4 py-3 text-muted">{l.userEmail || "system"}</td>
                  <td className="px-4 py-3"><span style={{ color: l.status === "failed" ? "#f43f5e" : "#34d399" }}>{l.status}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{l.ip || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted">{timeAgo(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="panel panel-hover p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
        <span className="text-lg">{icon}</span>
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
    </div>
  );
}
