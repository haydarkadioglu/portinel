"use client";

import { useState, useEffect, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { cn, timeAgo } from "@/lib/utils";

interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}
interface Connector {
  id: string;
  name: string;
  url: string;
  serverName: string | null;
  serverVersion: string | null;
  tools: McpTool[];
  status: string;
  lastError: string | null;
  lastConnectedAt: string | null;
}

export function McpConnectorsPanel() {
  const [items, setItems] = useState<Connector[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toolCall, setToolCall] = useState<{ id: string; tool: string } | null>(null);
  const [toolArgs, setToolArgs] = useState("{}");
  const [toolResult, setToolResult] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      const res = await fetch("/api/mcp");
      const d = await res.json();
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setError("");
    setBusy("add");
    try {
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, url, connect: true }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || d.connection?.error || "Failed");
      } else if (d.connection?.error) {
        setError(`Saved but connection failed: ${d.connection.error}`);
      }
      setName("");
      setUrl("");
      await refresh();
    } catch {
      setError("Network error.");
    }
    setBusy(null);
  }

  async function connect(id: string) {
    setBusy(id);
    setError("");
    setItems((i) => i.map((c) => (c.id === id ? { ...c, status: "connecting" } : c)));
    try {
      const res = await fetch(`/api/mcp/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "connect" }),
      });
      const d = await res.json();
      if (!res.ok || d.connection?.status === "error") {
        setError(d.connection?.error || d.error || "Connection failed");
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: string) {
    setBusy(id);
    await fetch(`/api/mcp/${id}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "disconnect" }),
    });
    await refresh();
    setBusy(null);
  }

  async function remove(id: string) {
    if (!confirm("Delete this MCP connector?")) return;
    await fetch(`/api/mcp/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function runTool(id: string, tool: string) {
    setToolCall({ id, tool });
    setToolResult(null);
    try {
      const args = JSON.parse(toolArgs || "{}");
      const res = await fetch(`/api/mcp/${id}/call`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tool, args }),
      });
      const d = await res.json();
      setToolResult(d.ok ? d.result : `Error: ${d.error}`);
    } catch (e) {
      setToolResult(`Error: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return (
    <div className="space-y-5">
      {/* Add connector */}
      <form onSubmit={add} className="rounded-xl border border-line bg-black/20 p-4">
        <div className="mb-2 text-xs font-medium text-muted">Add MCP server (SSE endpoint)</div>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. Kalide)" className="input" />
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://mcp-server.example.com/sse" className="input font-mono text-xs" />
          <button type="submit" disabled={busy === "add"} className="btn btn-primary whitespace-nowrap">
            {busy === "add" ? <Spinner className="h-4 w-4" /> : "+ Add & connect"}
          </button>
        </div>
        {error && <div className="mt-2 text-sm text-danger">{error}</div>}
      </form>

      {/* Connector list */}
      {loading ? (
        <div className="flex justify-center py-8 text-muted"><Spinner className="h-6 w-6" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-line p-10 text-center">
          <div className="mb-2 text-3xl">🔌</div>
          <p className="text-sm text-muted">No MCP connectors yet. Add an SSE MCP server URL above to connect external tools.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const isOpen = expanded === c.id;
            const connected = c.status === "connected";
            return (
              <div key={c.id} className="rounded-xl border border-line bg-white/[0.02] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button onClick={() => setExpanded(isOpen ? null : c.id)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span className={cn("h-2.5 w-2.5 rounded-full", connected ? "animate-pulse bg-success shadow-[0_0_8px_#34d399]" : c.status === "connecting" ? "animate-pulse bg-warning" : "bg-muted")} />
                      <span className="font-semibold">{c.name}</span>
                      <span className={cn("badge", connected ? "sev-low" : c.status === "error" ? "sev-critical" : "sev-info")}>{c.status}</span>
                      {connected && c.tools.length > 0 && <span className="badge sev-info">{c.tools.length} tools</span>}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-xs text-muted">{c.url}</div>
                    {c.serverName && <div className="text-[0.7rem] text-muted">{c.serverName}{c.serverVersion ? ` v${c.serverVersion}` : ""}{c.lastConnectedAt ? ` · ${timeAgo(c.lastConnectedAt)}` : ""}</div>}
                    {c.lastError && c.status === "error" && <div className="mt-1 text-[0.7rem] text-danger">{c.lastError}</div>}
                  </button>
                  <div className="flex gap-1.5">
                    {connected ? (
                      <button onClick={() => disconnect(c.id)} disabled={busy === c.id} className="btn btn-danger !py-1.5 !text-xs">
                        {busy === c.id ? <Spinner className="h-3.5 w-3.5" /> : "Disconnect"}
                      </button>
                    ) : (
                      <button onClick={() => connect(c.id)} disabled={busy === c.id} className="btn btn-primary !py-1.5 !text-xs">
                        {busy === c.id ? <Spinner className="h-3.5 w-3.5" /> : "⚡ Connect"}
                      </button>
                    )}
                    <button onClick={() => remove(c.id)} className="btn btn-ghost !py-1.5 !text-xs">Delete</button>
                  </div>
                </div>

                {/* Tools (expanded) */}
                {isOpen && connected && (
                  <div className="mt-4 border-t border-line pt-3">
                    <div className="mb-2 text-xs font-medium text-muted">Available tools ({c.tools.length})</div>
                    {c.tools.length === 0 ? (
                      <p className="text-xs text-muted">No tools exposed by this server.</p>
                    ) : (
                      <div className="space-y-2">
                        {c.tools.map((t) => (
                          <div key={t.name} className="rounded-lg border border-line bg-black/20 p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <code className="font-mono text-xs text-brand">{t.name}</code>
                                {t.description && <p className="mt-0.5 text-[0.7rem] text-muted">{t.description}</p>}
                              </div>
                              <button onClick={() => { setToolCall({ id: c.id, tool: t.name }); setToolArgs("{}"); setToolResult(null); }} className="btn btn-ghost !py-1 !text-xs">
                                ▶ Run
                              </button>
                            </div>
                            {/* Inline tool runner */}
                            {toolCall?.id === c.id && toolCall?.tool === t.name && (
                              <div className="mt-2 space-y-2">
                                <textarea value={toolArgs} onChange={(e) => setToolArgs(e.target.value)} placeholder='{"key":"value"}' rows={2} className="input font-mono text-xs" />
                                <button onClick={() => runTool(c.id, t.name)} className="btn btn-primary !py-1 !text-xs w-full">Execute {t.name}</button>
                                {toolResult !== null && (
                                  <pre className="max-h-48 overflow-auto rounded-lg bg-black/40 p-2 font-mono text-[0.7rem] text-muted">{toolResult}</pre>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Supabase hint */}
      <div className="rounded-lg border border-line bg-white/[0.02] p-3 text-[0.7rem] text-muted">
        🔗 Tool execution results are written to the local database <strong>and</strong> mirrored to Supabase
        (<code className="font-mono">mcp_executions</code> table). Connected MCP tools are also available to the AI chat assistant —
        the LLM can invoke them automatically during conversations.
      </div>
    </div>
  );
}
