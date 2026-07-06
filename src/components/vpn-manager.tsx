"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

interface VpnItem {
  id: string;
  name: string;
  remoteHost: string | null;
  remotePort: number | null;
  remoteProto: string | null;
  connectionStatus: string;
  tunnelIp: string | null;
  lastConnectedAt: string | null;
}

export function VpnManager() {
  const [items, setItems] = useState<VpnItem[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/vpn");
      const d = await res.json();
      setItems(d.items ?? []);
      setAvailable(d.openvpnAvailable ?? false);
    } finally {
      setLoading(false);
    }
  }

  async function upload(e: FormEvent) {
    e.preventDefault();
    if (!file) { setError("Select an .ovpn file."); return; }
    setError("");
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    if (name) fd.append("name", name);
    try {
      const res = await fetch("/api/vpn", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Upload failed"); setUploading(false); return; }
      setFile(null);
      setName("");
      (document.getElementById("ovpn-file") as HTMLInputElement).value = "";
      await refresh();
    } catch {
      setError("Upload failed.");
    }
    setUploading(false);
  }

  async function action(id: string, act: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/vpn/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: act }),
      });
      const d = await res.json();
      if (act === "preview") {
        setPreview(d.config || "(empty)");
      } else {
        if (!res.ok && d.message) setError(d.message);
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this VPN config? Disconnect if active.")) return;
    await fetch(`/api/vpn/${id}`, { method: "DELETE" });
    await refresh();
  }

  return (
    <div className="space-y-5">
      {/* Runtime capability banner */}
      {available !== null && (
        <div className={cn(
          "flex items-start gap-3 rounded-lg border p-3 text-xs",
          available ? "border-success/30 bg-success/5 text-success" : "border-warning/30 bg-warning/5 text-warning"
        )}>
          <span className="text-base">{available ? "✅" : "⚠️"}</span>
          <div>
            {available ? (
              <>OpenVPN runtime detected. Tunnels will establish a real network connection into the target LAN.</>
            ) : (
              <>
                <strong>OpenVPN binary not available in this sandbox.</strong> VPN configs are parsed, validated and
                encrypted-at-rest, and the connect flow is fully implemented. Deploy on a host with{" "}
                <code className="font-mono">openvpn</code> + <code className="font-mono">CAP_NET_ADMIN</code> to bring up live tunnels for in-LAN scanning.
              </>
            )}
          </div>
        </div>
      )}

      {/* Upload form */}
      <form onSubmit={upload} className="rounded-xl border border-line bg-black/20 p-4">
        <div className="mb-2 text-xs font-medium text-muted">Upload OpenVPN profile (.ovpn)</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Corp LAN)"
            className="input"
          />
          <input
            id="ovpn-file"
            type="file"
            accept=".ovpn,.conf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="input file:mr-3 file:rounded file:border-0 file:bg-brand/20 file:px-3 file:py-1 file:text-brand"
          />
          <button type="submit" disabled={uploading} className="btn btn-primary whitespace-nowrap">
            {uploading ? <Spinner className="h-4 w-4" /> : "🔒 Encrypt & upload"}
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-danger">{error}</div>}
        <p className="mt-2 text-[0.7rem] text-muted">
          Configs are encrypted with AES-256-GCM before storage. We extract the remote endpoint for display only.
        </p>
      </form>

      {/* Config list */}
      {loading ? (
        <div className="flex justify-center py-8 text-muted"><Spinner className="h-6 w-6" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-10 text-center">
          <div className="mb-2 text-3xl">📡</div>
          <p className="text-sm text-muted">No VPN profiles yet. Upload an .ovpn to scan inside a target network.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((v) => {
            const connected = v.connectionStatus === "connected";
            return (
              <div key={v.id} className="rounded-xl border border-line bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        connected ? "animate-pulse bg-success shadow-[0_0_8px_#34d399]" : "bg-muted"
                      )} />
                      <span className="font-semibold">{v.name}</span>
                      <span className={cn(
                        "badge",
                        connected ? "sev-low" : v.connectionStatus === "error" ? "sev-critical" : "sev-info"
                      )}>{v.connectionStatus}</span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted">
                      {v.remoteHost ? `${v.remoteHost}:${v.remotePort || "?"}/${v.remoteProto || "udp"}` : "endpoint unknown"}
                      {v.tunnelIp && <span className="ml-2 text-brand">tunnel: {v.tunnelIp}</span>}
                    </div>
                    {v.lastConnectedAt && (
                      <div className="text-[0.7rem] text-muted">last connected {timeAgo(v.lastConnectedAt)}</div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {connected ? (
                      <button onClick={() => action(v.id, "disconnect")} disabled={busy === v.id} className="btn btn-danger !py-1.5 !text-xs">
                        {busy === v.id ? <Spinner className="h-3.5 w-3.5" /> : "Disconnect"}
                      </button>
                    ) : (
                      <button onClick={() => action(v.id, "connect")} disabled={busy === v.id} className="btn btn-primary !py-1.5 !text-xs">
                        {busy === v.id ? <Spinner className="h-3.5 w-3.5" /> : "⚡ Connect"}
                      </button>
                    )}
                    <button onClick={() => action(v.id, "preview")} className="btn btn-ghost !py-1.5 !text-xs">View</button>
                    <button onClick={() => remove(v.id)} className="btn btn-ghost !py-1.5 !text-xs">Delete</button>
                  </div>
                </div>
                {connected && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-success/20 bg-success/5 p-2 text-xs text-success">
                    ✓ Tunnel active — new scans of private/LAN targets will route through this connection.
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Config preview modal */}
      {preview && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPreview(null)}>
          <div className="panel max-h-[80vh] w-full max-w-2xl overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-semibold">OpenVPN config (redacted)</h3>
              <button onClick={() => setPreview(null)} className="btn btn-ghost !py-1 !text-xs">Close</button>
            </div>
            <pre className="overflow-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-muted">{preview}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
