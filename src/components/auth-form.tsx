"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const isRegister = mode === "register";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const payload: Record<string, string> = {
      email: String(form.get("email") || ""),
      password: String(form.get("password") || ""),
    };
    if (isRegister) {
      payload.name = String(form.get("name") || "");
      if (form.get("company")) payload.company = String(form.get("company"));
    }
    try {
      const res = await fetch(`/api/auth/${mode}`, {
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
      {isRegister && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Full name" name="name" type="text" placeholder="Morgan Hale" required />
          <Field label="Company" name="company" type="text" placeholder="Optional" />
        </div>
      )}
      <Field label="Work email" name="email" type="email" placeholder="you@company.com" required />
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted">Password</label>
        <input
          name="password"
          type="password"
          placeholder={isRegister ? "At least 8 characters" : "••••••••"}
          required
          minLength={isRegister ? 8 : 1}
          className="input"
        />
      </div>
      {error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
      )}
      <button type="submit" disabled={loading} className="btn btn-primary w-full">
        {loading ? <Spinner className="h-4 w-4" /> : null}
        {isRegister ? "Create account" : "Sign in"}
      </button>
      <p className="text-center text-sm text-muted">
        Access is managed by your administrator.
      </p>
    </form>
  );
}

function Field({
  label,
  name,
  type,
  placeholder,
  required,
}: {
  label: string;
  name: string;
  type: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-muted">{label}</label>
      <input name={name} type={type} placeholder={placeholder} required={required} className="input" />
    </div>
  );
}
