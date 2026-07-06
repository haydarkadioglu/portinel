import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mcpConnectors, chatMessages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { getScan } from "@/lib/scan-service";
import { chatAboutScan, type LlmMessage } from "@/lib/llm";
import { isMcpConnected, type McpTool } from "@/lib/mcp";
import { SUGGESTED_PROMPTS } from "@/lib/ai-chat";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limited = rateLimit(`chat:${user.id}`, 40, 1);
  if (!limited.ok)
    return NextResponse.json({ error: "Rate limit reached. Slow down." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const { scanId, question, history } = body || {};
  if (!scanId || !question)
    return NextResponse.json({ error: "scanId and question are required." }, { status: 400 });

  const scan = await getScan(scanId, user.id);
  if (!scan || !scan.results)
    return NextResponse.json({ error: "Scan not found or has no results." }, { status: 404 });

  // Sanitise incoming history (only role/content, capped length).
  const cleanHistory: LlmMessage[] = Array.isArray(history)
    ? history
        .filter(
          (m: unknown) =>
            m && typeof m === "object" &&
            ["user", "assistant"].includes((m as { role: string }).role) &&
            typeof (m as { content: unknown }).content === "string",
        )
        .slice(-10)
        .map((m: { role: string; content: string }) => ({
          role: m.role as "user" | "assistant",
          content: String(m.content).slice(0, 2000),
        }))
    : [];

  try {
    // Gather connected MCP connectors so the LLM can use their tools.
    const mcpRows = await db
      .select()
      .from(mcpConnectors)
      .where(and(eq(mcpConnectors.userId, user.id), eq(mcpConnectors.status, "connected")))
      .limit(10);
    const connected = mcpRows
      .filter((c) => isMcpConnected(c.id))
      .map((c) => ({ id: c.id, tools: (c.tools as McpTool[]) ?? [] }));

    // Build in-context agent tools (built-in scan actions the AI can trigger).
    const agentTools = buildAgentTools(scan.id);

    // Merge MCP tools + built-in agent tools for the LLM.
    const allTools = [...connected, ...agentTools];

    // Load persisted conversation memory to strengthen context (beyond the
    // client-provided history, which is lost on page reload).
    const priorMessages = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.scanId, scanId), eq(chatMessages.userId, user.id)));
    const memoryHistory: LlmMessage[] = priorMessages
      .slice(-10)
      .map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      }));
    // Prefer client history if present, else fall back to DB memory.
    const effectiveHistory = cleanHistory.length >= memoryHistory.length ? cleanHistory : memoryHistory;

    const result = await chatAboutScan(
      scan.results,
      effectiveHistory,
      String(question).slice(0, 1000),
      allTools.length ? allTools : undefined,
      user.id,
      scanId,
    );

    // Persist this exchange to the conversation memory.
    const persisted: { role: string; content: string; provider?: string; toolsUsed?: unknown }[] = [
      { role: "user", content: String(question).slice(0, 1000) },
      { role: "assistant", content: result.answer, provider: result.provider, toolsUsed: result.toolsUsed ?? [] },
    ];
    db.insert(chatMessages)
      .values(
        persisted.map((m) => ({
          scanId,
          userId: user.id,
          role: m.role,
          content: m.content,
          provider: m.provider || null,
          toolsUsed: m.toolsUsed || null,
        })),
      )
      .then(() => {})
      .catch(() => {});

    return NextResponse.json({
      answer: result.answer,
      provider: result.provider,
      usedFallback: result.usedFallback,
      toolsUsed: result.toolsUsed ?? [],
      suggestions: SUGGESTED_PROMPTS,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI request failed." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ suggestions: SUGGESTED_PROMPTS });
}

// Built-in "agent" tools the AI can invoke autonomously. These appear to the
// LLM exactly like MCP tools (function-calling) but are executed by Portinel.
function buildAgentTools(scanId: string): { id: string; tools: McpTool[] }[] {
  return [
    {
      id: "__agent__",
      tools: [
        {
          name: `launch_subscan::${scanId}`,
          description:
            "Launch a deep reconnaissance scan on a specific host/subdomain/URL discovered in this scan. Use this to drill down into interesting subdomains, login pages, or IP addresses. Pass the exact target to scan.",
          inputSchema: {
            type: "object",
            properties: {
              target: {
                type: "string",
                description: "The host/subdomain/IP/URL to scan (e.g. api.example.com or 10.0.0.5)",
              },
              modules: {
                type: "string",
                description: "Comma-separated scan types: deep,quick,ssl,http,subdomains,web,waf (default: quick,ssl,http)",
              },
            },
            required: ["target"],
          },
        },
        {
          name: `list_subdomains::${scanId}`,
          description:
            "List the subdomains discovered in the current scan, with their IPs. Useful before deciding what to drill into.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: `list_open_ports::${scanId}`,
          description: "List all open ports and services detected in the current scan.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: `list_findings::${scanId}`,
          description: "List all security findings from the current scan, sorted by severity.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    },
  ];
}
