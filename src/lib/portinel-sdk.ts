// ============================================================================
// portinel-sdk.ts — Standalone API client SDK for Portinel.
//
// A zero-dependency TypeScript client that wraps the entire Portinel REST API.
// Designed for external applications: desktop apps (Electron/Tauri), CLI tools,
// CI/CD integrations, or any TypeScript project that needs to interact with
// a Portinel instance programmatically.
//
// Usage:
//   import { PortinelClient } from "./portinel-sdk";
//   const client = new PortinelClient("https://portinel.io", "pt_live_xxx");
//   const scan = await client.scans.create({ target: "example.com", scanTypes: ["deep"] });
//
// This file is a self-contained copy — copy it into any project.
// ============================================================================

export interface Scan {
  id: string;
  target: string;
  targetType: string;
  scanTypes: string[];
  status: "queued" | "running" | "completed" | "failed";
  riskScore: number | null;
  grade: string | null;
  openPortCount: number;
  results: Record<string, unknown> | null;
  error: string | null;
  shareToken: string | null;
  durationMs: number | null;
  parentId: string | null;
  rootId: string | null;
  label: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface CreateScanOptions {
  target: string;
  scanTypes: string[];
  ports?: string;
  intensity?: "light" | "normal" | "aggressive";
  parentId?: string;
  label?: string;
}

export interface ChatResult {
  answer: string;
  provider: string;
  usedFallback: boolean;
  toolsUsed: { connector: string; tool: string }[];
}

export interface McpConnector {
  id: string;
  name: string;
  url: string;
  status: string;
  tools: { name: string; description?: string }[];
}

export interface ScanProgress {
  scanId: string;
  status: string;
  stage: string;
  message: string;
  progress: number;
  updatedAt: number;
}

export class PortinelClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown; query?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) url.searchParams.set(k, v);
    }
    const res = await fetch(url.toString(), {
      method: options.method || "GET",
      headers: {
        "x-api-key": this.apiKey,
        "content-type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const e = await res.json(); msg = e.error || msg; } catch { /* */ }
      throw new Error(msg);
    }
    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Scans
  // -------------------------------------------------------------------------
  scans = {
    list: (opts: { limit?: number; target?: string } = {}) =>
      this.request<{ items: Scan[] }>("/api/v1/scans", { query: { limit: String(opts.limit ?? 25), ...(opts.target ? { target: opts.target } : {}) } }).then((r) => r.items),

    get: (id: string) =>
      this.request<{ scan: Scan }>(`/api/v1/scans/${id}`).then((r) => r.scan),

    create: (options: CreateScanOptions) =>
      this.request<{ scan: Scan }>("/api/v1/scans", { method: "POST", body: options }).then((r) => r.scan),

    tree: (id: string) =>
      this.request<{ items: Scan[] }>(`/api/scans/${id}/tree`).then((r) => r.items),

    compare: (a: string, b: string) =>
      this.request<{ diff: Record<string, unknown> }>(`/api/scans/compare`, { query: { a, b } }).then((r) => r.diff),

    export: (id: string, format: "md" | "json" | "ports" | "findings" = "json") =>
      fetch(`${this.baseUrl}/api/v1/scans/${id}/export?format=${format}`, {
        headers: { "x-api-key": this.apiKey },
      }).then((r) => r.text()),

    /** Subscribe to live scan progress via SSE (returns an unsubscribe fn). */
    stream: (id: string, onUpdate: (p: ScanProgress) => void): (() => void) => {
      const es = new EventSource(`${this.baseUrl}/api/scans/${id}/stream`);
      es.onmessage = (ev) => {
        try { onUpdate(JSON.parse(ev.data) as ScanProgress); } catch { /* */ }
      };
      return () => es.close();
    },

    /** Wait for a scan to complete, polling every `intervalMs`. */
    waitFor: async (id: string, intervalMs = 5000, timeoutMs = 120000): Promise<Scan> => {
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        const scan = await this.scans.get(id);
        if (scan.status === "completed" || scan.status === "failed") return scan;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      throw new Error("Scan timed out waiting for completion.");
    },
  };

  // -------------------------------------------------------------------------
  // AI Chat
  // -------------------------------------------------------------------------
  chat = {
    ask: (scanId: string, question: string, history?: { role: string; content: string }[]) =>
      this.request<ChatResult>("/api/chat", {
        method: "POST",
        body: { scanId, question, history: history || [] },
      }),

    suggestions: () =>
      this.request<{ suggestions: string[] }>("/api/chat").then((r) => r.suggestions),
  };

  // -------------------------------------------------------------------------
  // MCP Connectors
  // -------------------------------------------------------------------------
  mcp = {
    list: () =>
      this.request<{ items: McpConnector[] }>("/api/mcp").then((r) => r.items),

    add: (name: string, url: string) =>
      this.request<{ item: McpConnector }>("/api/mcp", { method: "POST", body: { name, url, connect: true } }).then((r) => r.item),

    connect: (id: string) =>
      this.request(`/api/mcp/${id}`, { method: "POST", body: { action: "connect" } }),

    disconnect: (id: string) =>
      this.request(`/api/mcp/${id}`, { method: "POST", body: { action: "disconnect" } }),

    remove: (id: string) =>
      this.request(`/api/mcp/${id}`, { method: "DELETE" }),

    call: (id: string, tool: string, args: Record<string, unknown> = {}) =>
      this.request<{ ok: boolean; result?: string; error?: string }>(`/api/mcp/${id}/call`, {
        method: "POST",
        body: { tool, args },
      }),

    history: (id: string) =>
      this.request<{ items: unknown[] }>(`/api/mcp/${id}/call`).then((r) => r.items),
  };

  // -------------------------------------------------------------------------
  // Notifications
  // -------------------------------------------------------------------------
  notifications = {
    list: () =>
      this.request<{ items: unknown[] }>("/api/notifications").then((r) => r.items),
  };

  // -------------------------------------------------------------------------
  // Health
  // -------------------------------------------------------------------------
  health = {
    check: () =>
      this.request<{ ok: boolean }>("/api/health"),
  };
}

// Default export for CommonJS compatibility
export default PortinelClient;
