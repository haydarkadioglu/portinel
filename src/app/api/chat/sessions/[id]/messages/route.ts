import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatSessions, chatMessages, mcpConnectors } from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { generalAiChat, type LlmMessage } from "@/lib/llm";
import { isMcpConnected, type McpTool } from "@/lib/mcp";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/chat/sessions/[id]/messages: retrieve message history
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const list = await db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.sessionId, id), eq(chatMessages.userId, user.id)))
      .orderBy(asc(chatMessages.createdAt));

    return NextResponse.json({ messages: list });
  } catch (err) {
    console.error("[chat messages GET] failed:", err);
    return NextResponse.json({ error: "Failed to load message history." }, { status: 500 });
  }
}

// POST /api/chat/sessions/[id]/messages: send a message and trigger the general AI assistant
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimit(`chat:${user.id}`, 40, 1);
  if (!limited.ok) {
    return NextResponse.json({ error: "Rate limit reached. Slow down." }, { status: 429 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { question, history } = body;

  if (!question) {
    return NextResponse.json({ error: "Question is required." }, { status: 400 });
  }

  // Load the session
  const [session] = await db
    .select()
    .from(chatSessions)
    .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, user.id)))
    .limit(1);

  if (!session) {
    return NextResponse.json({ error: "Session not found." }, { status: 404 });
  }

  // Gather connected MCP connectors for tool use
  const mcpRows = await db
    .select()
    .from(mcpConnectors)
    .where(and(eq(mcpConnectors.userId, user.id), eq(mcpConnectors.status, "connected")))
    .limit(10);

  const connectedMcp = mcpRows
    .filter((c) => isMcpConnected(c.id))
    .map((c) => ({ id: c.id, tools: (c.tools as McpTool[]) ?? [] }));

  // Sanitize client-provided history
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
    // Run the General AI chat
    const result = await generalAiChat(cleanHistory, question, connectedMcp, user.id);

    // Save exchange to DB
    const userMsg = await db
      .insert(chatMessages)
      .values({
        sessionId: id,
        userId: user.id,
        role: "user",
        content: String(question).slice(0, 1000),
      })
      .returning();

    const assistantMsg = await db
      .insert(chatMessages)
      .values({
        sessionId: id,
        userId: user.id,
        role: "assistant",
        content: result.answer,
        provider: result.provider,
        toolsUsed: result.toolsUsed ?? [],
      })
      .returning();

    // Auto-update session title if it's the first message and still has the default title
    if (session.title === "New Chat") {
      const titleCandidate = question.trim().slice(0, 40) + (question.trim().length > 40 ? "..." : "");
      await db
        .update(chatSessions)
        .set({ title: titleCandidate })
        .where(eq(chatSessions.id, id));
    }

    return NextResponse.json({
      answer: result.answer,
      provider: result.provider,
      usedFallback: result.usedFallback,
      toolsUsed: result.toolsUsed ?? [],
      messages: [userMsg[0], assistantMsg[0]],
    });
  } catch (err) {
    console.error("[general AI chat failed]:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI request failed." },
      { status: 500 },
    );
  }
}
