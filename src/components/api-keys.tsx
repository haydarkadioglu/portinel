"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

interface Key {
  id: string;
  name: string;
  keyPrefix: string;
  requests: number;
  ratePerHour: number;
  revoked: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export function ApiKeys() {
  const [keys, setKeys] = useState<Key[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/api-keys")
      .then((r) => r.json())
      .then((d) => setKeys(d.keys ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    const res = await fetch("/api/api-keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok) {
      setNewKey(data.key);
      setName("");
      setKeys((k) => [
        { id: data.id, name, keyPrefix: data.prefix, requests: 0, ratePerHour: 100, revoked: false, lastUsedAt: null, createdAt: new Date().toISOString() },
        ...k,
      ]);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" });
    setKeys((k) => k.map((x) => (x.id === id ? { ...x, revoked: true } : x)));
  }

  return (
    <div className="space-y-5">
      <form onSubmit={create} className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name (e.g. CI pipeline)" className="input" />
        <button type="submit" disabled={creating} className="btn btn-primary whitespace-nowrap">
          {creating ? <Spinner className="h-4 w-4" /> : "+ Generate key"}
        </button>
      </form>

      {newKey && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
          <div className="text-sm font-semibold text-warning">Copy your API key now — it won&apos;t be shown again.</div>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded-md bg-black/40 px-3 py-2 font-mono text-xs text-brand">{newKey}</code>
            <button onClick={() => { navigator.clipboard?.writeText(newKey); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="btn btn-ghost !py-1.5 !text-xs">
              {copied ? "✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8 text-muted"><Spinner className="h-5 w-5" /></div>
      ) : keys.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No API keys yet.</p>
      ) : (
        <div className="space-y-2">
          {keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white/[0.02] p-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{k.name}</span>
                  {k.revoked && <span className="badge sev-critical">revoked</span>}
                </div>
                <div className="font-mono text-xs text-muted">{k.keyPrefix}…{k.id.slice(0, 4)} · {k.requests} requests · {k.ratePerHour}/hr</div>
              </div>
              <div className="text-xs text-muted">{k.lastUsedAt ? `used ${timeAgo(k.lastUsedAt)}` : "never used"}</div>
              {!k.revoked && (
                <button onClick={() => revoke(k.id)} className="btn btn-danger !py-1.5 !text-xs">Revoke</button>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-black/20 p-4 font-mono text-xs text-muted">
        <div className="mb-1 font-sans text-xs font-semibold text-ink">Example usage:</div>
        curl -X POST https://portinel.io/api/v1/scans \<br />
        &nbsp;&nbsp;-H &quot;X-API-Key: YOUR_KEY&quot; \<br />
        &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
        &nbsp;&nbsp;-d &apos;&#123;&quot;target&quot;:&quot;example.com&quot;,&quot;scanTypes&quot;:[&quot;quick&quot;]&#125;&apos;
      </div>
    </div>
  );
}
