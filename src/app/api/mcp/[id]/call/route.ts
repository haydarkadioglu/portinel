import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mcpConnectors, mcpExecutions } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { callTool, isMcpConnected } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  // Verify ownership.
  const [row] = await db
    .select()
    .from(mcpConnectors)
    .where(and(eq(mcpConnectors.id, id), eq(mcpConnectors.userId, user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Connector not found." }, { status: 404 });
  if (!isMcpConnected(id))
    return NextResponse.json({ error: "Connector is not connected. Connect it first." }, { status: 409 });

  const body = await req.json().catch(() => null);
  const { tool, args } = body || {};
  if (!tool)
    return NextResponse.json({ error: "Tool name is required." }, { status: 400 });

  const result = await callTool(id, String(tool), (args || {}) as Record<string, unknown>, user.id);
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}

// List recent executions for this connector.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const rows = await db
    .select({
      id: mcpExecutions.id,
      toolName: mcpExecutions.toolName,
      args: mcpExecutions.args,
      result: mcpExecutions.result,
      durationMs: mcpExecutions.durationMs,
      success: mcpExecutions.success,
      createdAt: mcpExecutions.createdAt,
    })
    .from(mcpExecutions)
    .where(and(eq(mcpExecutions.connectorId, id), eq(mcpExecutions.userId, user.id)))
    .orderBy(desc(mcpExecutions.createdAt))
    .limit(20);
  return NextResponse.json({ items: rows });
}
