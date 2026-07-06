"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

interface Role { id: string; label: string; description: string }
interface UserRow {
  id: string; email: string; name: string; role: string; plan: string;
  status: string; company: string | null; scanCount: number;
  createdAt: string; lastLoginAt: string | null; authSource?: string;
}

export function UserManager() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Create form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("analyst");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/users/create").then((r) => r.json()),
      fetch("/api/admin/users").then((r) => r.json()),
    ]).then(([rolesData, usersData]) => {
      setRoles(rolesData.roles ?? []);
      setUsers(usersData.users ?? []);
    }).finally(() => setLoading(false));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");
    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password, name, role }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setShowCreate(false);
      setEmail(""); setPassword(""); setName("");
      await refreshUsers();
    } else {
      setError(data.error || "Failed to create user.");
    }
  }

  async function refreshUsers() {
    const res = await fetch("/api/admin/users");
    const d = await res.json();
    setUsers(d.users ?? []);
  }

  async function updateRole(id: string, newRole: string) {
    setBusy(id);
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    setBusy(null);
  }

  async function toggleStatus(id: string, status: string) {
    const next = status === "active" ? "suspended" : "active";
    setUsers((us) => us.map((u) => (u.id === id ? { ...u, status: next } : u)));
    await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
  }

  if (loading)
    return <div className="flex justify-center py-12 text-muted"><Spinner className="h-6 w-6" /></div>;

  const ROLE_COLORS: Record<string, string> = {
    admin: "sev-critical", pentester: "sev-medium", analyst: "sev-low", viewer: "sev-info",
  };

  return (
    <div className="space-y-5">
      {/* Role legend */}
      <div className="flex flex-wrap gap-2">
        {roles.map((r) => (
          <div key={r.id} className="rounded-lg border border-line bg-white/[0.02] px-3 py-1.5 text-xs">
            <span className={cn("badge mr-1.5", ROLE_COLORS[r.id])}>{r.id}</span>
            <span className="text-muted">{r.description}</span>
          </div>
        ))}
      </div>

      {/* Create user toggle */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          + Create user account
        </button>
      ) : (
        <form onSubmit={create} className="rounded-xl border border-line bg-black/20 p-5">
          <h3 className="mb-3 font-semibold">Create new account</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" required className="input" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" required className="input" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password (min 8 chars)" required minLength={8} className="input" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
              {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>
          {error && <div className="mt-3 text-sm text-danger">{error}</div>}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={creating} className="btn btn-primary">
              {creating ? <Spinner className="h-4 w-4" /> : "Create account"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      {/* User table */}
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase text-muted">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Scans</th>
              <th className="px-4 py-3">Last login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/40 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    disabled={busy === u.id}
                    className="input !py-1 !text-xs"
                  >
                    {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <button onClick={() => toggleStatus(u.id, u.status)} className={cn("badge", u.status === "active" ? "sev-low" : "sev-critical")}>
                    {u.status}
                  </button>
                </td>
                <td className="px-4 py-3 text-muted">{u.scanCount}</td>
                <td className="px-4 py-3 text-xs text-muted">{u.lastLoginAt ? timeAgo(u.lastLoginAt) : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
