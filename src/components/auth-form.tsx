"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

export function AuthForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      let data: { error?: string } = {};
      try { data = await res.json(); } catch { data = {}; }
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status}).`);
        setLoading(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next || "/dashboard");
      router.refresh();
    } catch {
      setError("Could not reach the server.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Work email</label>
        <input name="email" type="email" placeholder="you@company.com" required className="input" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Password</label>
        <input name="password" type="password" placeholder="••••••••" required className="input" />
      </div>
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? <Spinner className="h-4 w-4" /> : null}
        Sign in
      </button>
      <p className="text-center text-sm text-muted">
        Access is managed by your administrator.
      </p>
    </form>
  );
}
