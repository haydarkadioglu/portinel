"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

interface Webhook {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  lastStatus: number | null;
  deliveryCount: number;
  lastFiredAt: string | null;
}

export function WebhooksManager() {
  const [items, setItems] = useState<Webhook[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/webhooks")
      .then((r) => r.json())
      .then((d) => setItems(d.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError("");
    setCreating(true);
    const res = await fetch("/api/webhooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, url }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setItems((i) => [
        { id: data.item.id, name, url, enabled: true, lastStatus: null, deliveryCount: 0, lastFiredAt: null },
        ...i,
      ]);
      setName("");
      setUrl("");
    } else {
      setError(data.error || "Failed to create webhook");
    }
  }

  async function toggle(id: string, enabled: boolean) {
    setItems((i) => i.map((x) => (x.id === id ? { ...x, enabled } : x)));
    await fetch(`/api/webhooks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  }
  async function remove(id: string) {
    await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
    setItems((i) => i.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4">
      <form onSubmit={create} className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Security Slack)" className="input" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="input font-mono text-xs" />
        <button type="submit" disabled={creating} className="btn btn-primary whitespace-nowrap">
          {creating ? <Spinner className="h-4 w-4" /> : "+ Add"}
        </button>
      </form>
      {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-6 text-muted"><Spinner className="h-5 w-5" /></div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          No webhooks. Add a Slack/Discord/custom URL to receive scan notifications.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{w.name}</span>
                  {w.url.includes("slack.com") && <span className="badge sev-info">Slack</span>}
                  {w.url.includes("discord.com") && <span className="badge sev-info">Discord</span>}
                  <span className={`badge ${w.enabled ? "sev-low" : "sev-info"}`}>{w.enabled ? "active" : "paused"}</span>
                </div>
                <div className="truncate font-mono text-xs text-muted">{w.url}</div>
                <div className="text-[0.7rem] text-muted">
                  {w.deliveryCount} delivered
                  {w.lastStatus !== null && ` · last ${w.lastStatus === 200 ? "✓" : w.lastStatus}`}
                  {w.lastFiredAt && ` · ${timeAgo(w.lastFiredAt)}`}
                </div>
              </div>
              <button onClick={() => toggle(w.id, !w.enabled)} className="btn btn-ghost !py-1.5 !text-xs">
                {w.enabled ? "Pause" : "Resume"}
              </button>
              <button onClick={() => remove(w.id)} className="btn btn-danger !py-1.5 !text-xs">Delete</button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Payloads auto-adapt: Slack &amp; Discord get rich embeds; other URLs receive a JSON event with
        risk score, open ports, CVE count and an AI summary.
      </p>
    </div>
  );
}
