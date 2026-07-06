// ============================================================================
// mcp.ts — Model Context Protocol (MCP) SSE client + connection manager.
//
// Connects to external MCP servers over the SSE transport (the standard
// streamable-HTTP variant used by most MCP servers, e.g. kalide):
//   1. GET <url> with Accept: text/event-stream → opens SSE channel
//   2. Server emits `event: endpoint` with a POST URL for JSON-RPC requests
//   3. Client POSTs JSON-RPC (initialize, tools/list, tools/call) to that URL
//   4. Responses arrive as `event: message` frames on the SSE channel
//
// Keeps connections alive in a registry so tools can be invoked on demand.
// Each connection auto-disconnects after an idle timeout.
// ============================================================================
import { db } from "@/db";
import { mcpConnectors, mcpExecutions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logToSupabase } from "./supabase";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpConnection {
  id: string;
  connectorId: string;
  name: string;
  serverName?: string;
  serverVersion?: string;
  tools: McpTool[];
  connectedAt: number;
  status: "connecting" | "connected" | "error" | "disconnected";
  error?: string;
}

// ---------------------------------------------------------------------------
// SSE stream parser (Node fetch streaming — no external dependency)
// ---------------------------------------------------------------------------
interface SseFrame {
  event: string;
  data: string;
}

async function* parseSse(
  response: Response,
  signal: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (signal.aborted) break;
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = "message";
      let data = "";
      for (const line of raw.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (event || data) yield { event, data };
    }
  }
}

// ---------------------------------------------------------------------------
// JSON-RPC helpers
// ---------------------------------------------------------------------------
interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ActiveConn {
  postUrl: string;
  baseUrl: string;
  pending: Map<number, Pending>;
  nextId: number;
  abort: AbortController;
  pumpPromise: Promise<void>;
  tools: McpTool[];
}

const connections = new Map<string, ActiveConn>(); // by connectorId

function rpc(conn: ActiveConn, method: string, params?: unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const id = conn.nextId++;
    const timer = setTimeout(() => {
      conn.pending.delete(id);
      reject(new Error(`MCP request timed out: ${method}`));
    }, 30000);
    conn.pending.set(id, { resolve, reject, timer });

    const body = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    fetch(conn.postUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: conn.abort.signal,
    }).catch((e) => {
      conn.pending.delete(id);
      clearTimeout(timer);
      reject(new Error(`MCP POST failed: ${e instanceof Error ? e.message : "network error"}`));
    });
  });
}

async function notify(conn: ActiveConn, method: string, params?: unknown): Promise<void> {
  await fetch(conn.postUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", method, params }),
    signal: conn.abort.signal,
  }).catch(() => {});
}

// Background pump: route SSE message frames to pending JSON-RPC requests.
function startPump(conn: ActiveConn, response: Response) {
  conn.pumpPromise = (async () => {
    try {
      for await (const frame of parseSse(response, conn.abort.signal)) {
        if (frame.event !== "message" || !frame.data) continue;
        try {
          const msg = JSON.parse(frame.data) as { id?: number; result?: unknown; error?: { message?: string } };
          if (msg.id !== undefined && conn.pending.has(msg.id)) {
            const p = conn.pending.get(msg.id)!;
            conn.pending.delete(msg.id);
            clearTimeout(p.timer);
            if (msg.error) p.reject(new Error(msg.error.message || "MCP error"));
            else p.resolve(msg.result);
          }
        } catch {
          /* non-JSON frame, ignore */
        }
      }
    } catch {
      /* stream ended */
    }
  })();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Establish an SSE connection to an MCP server and complete the handshake. */
export async function connectMcp(connectorId: string, url: string, name: string): Promise<McpConnection> {
  // Disconnect existing connection for this connector.
  await disconnectMcp(connectorId);

  const abort = new AbortController();
  const result: McpConnection = {
    id: connectorId,
    connectorId,
    name,
    tools: [],
    connectedAt: Date.now(),
    status: "connecting",
  };

  try {
    // Open the SSE channel (with a connect timeout so it never hangs).
    const connectTimeout = setTimeout(() => abort.abort(), 12000);
    const response = await fetch(url, {
      headers: { accept: "text/event-stream" },
      signal: abort.signal,
    });
    clearTimeout(connectTimeout);
    if (!response.ok || !response.body)
      throw new Error(`SSE connection failed (HTTP ${response.status})`);

    // Wait for the first 'endpoint' frame (gives us the POST URL).
    const gen = parseSse(response, abort.signal);
    const first = await gen.next();
    if (first.done || first.value.event !== "endpoint")
      throw new Error("Server did not provide an MCP endpoint");
    const postUrl = new URL(first.value.data, url).href;

    const conn: ActiveConn = {
      postUrl,
      baseUrl: url,
      pending: new Map(),
      nextId: 1,
      abort,
      tools: [],
      pumpPromise: Promise.resolve(),
    };
    connections.set(connectorId, conn);

    // Start the background pump now that we have the POST URL.
    startPump(conn, response);

    // JSON-RPC initialize handshake.
    const initResult = (await rpc(conn, "initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "Portinel", version: "1.0.0" },
    })) as { serverInfo?: { name?: string; version?: string } };

    result.serverName = initResult?.serverInfo?.name;
    result.serverVersion = initResult?.serverInfo?.version;

    await notify(conn, "notifications/initialized");

    // List available tools.
    const toolsResult = (await rpc(conn, "tools/list", {})) as { tools?: McpTool[] };
    conn.tools = toolsResult?.tools ?? [];
    result.tools = conn.tools;
    result.status = "connected";

    // Persist status + discovered tools.
    await db
      .update(mcpConnectors)
      .set({
        status: "connected",
        serverName: result.serverName,
        serverVersion: result.serverVersion,
        tools: conn.tools,
        lastConnectedAt: new Date(),
        lastError: null,
      })
      .where(eq(mcpConnectors.id, connectorId));

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Connection failed";
    result.status = "error";
    result.error = message;
    connections.delete(connectorId);
    abort.abort();
    await db
      .update(mcpConnectors)
      .set({ status: "error", lastError: message })
      .where(eq(mcpConnectors.id, connectorId))
      .catch(() => {});
    return result;
  }
}

/** Disconnect and tear down an MCP connection. */
export async function disconnectMcp(connectorId: string): Promise<void> {
  const conn = connections.get(connectorId);
  if (conn) {
    conn.abort.abort();
    connections.delete(connectorId);
  }
  await db
    .update(mcpConnectors)
    .set({ status: "disconnected" })
    .where(eq(mcpConnectors.id, connectorId))
    .catch(() => {});
}

/** Check whether a connector is currently connected. */
export function isMcpConnected(connectorId: string): boolean {
  return connections.has(connectorId);
}

/** Get a live snapshot of a connection (tools, status). */
export function getConnection(connectorId: string): McpConnection | null {
  const conn = connections.get(connectorId);
  if (!conn) return null;
  return {
    id: connectorId,
    connectorId,
    name: "",
    tools: conn.tools,
    connectedAt: Date.now(),
    status: "connected",
  };
}

/** Invoke an MCP tool and persist the result (local DB + Supabase). */
export async function callTool(
  connectorId: string,
  toolName: string,
  args: Record<string, unknown> = {},
  userId: string,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const conn = connections.get(connectorId);
  if (!conn) return { ok: false, error: "Connector not connected." };

  try {
    const startedAt = Date.now();
    const result = (await rpc(conn, "tools/call", { name: toolName, arguments: args })) as {
      content?: { type: string; text?: string }[];
      isError?: boolean;
    };

    const durationMs = Date.now() - startedAt;

    // Extract text content from the MCP result.
    let text = "";
    if (result?.content) {
      text = result.content
        .map((c) => c.text || "")
        .join("\n")
        .slice(0, 100000);
    } else {
      text = JSON.stringify(result);
    }

    const isError = !!result?.isError;
    const [row] = await db
      .insert(mcpExecutions)
      .values({
        connectorId,
        userId,
        toolName,
        args,
        result: text,
        durationMs,
        success: !isError,
      })
      .returning({ id: mcpExecutions.id });

    // Mirror to Supabase (best-effort).
    await logToSupabase("mcp_executions", {
      id: row.id,
      connector_id: connectorId,
      user_id: userId,
      tool_name: toolName,
      args,
      result: text.slice(0, 5000),
      duration_ms: durationMs,
      success: !isError,
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return { ok: !isError, result: text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool call failed";
    await db
      .insert(mcpExecutions)
      .values({
        connectorId,
        userId,
        toolName,
        args,
        result: message,
        durationMs: 0,
        success: false,
      })
      .catch(() => {});
    return { ok: false, error: message };
  }
}
