import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { mcpConnectors } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { connectMcp, disconnectMcp, isMcpConnected } from "@/lib/mcp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  const [row] = await db
    .select()
    .from(mcpConnectors)
    .where(and(eq(mcpConnectors.id, id), eq(mcpConnectors.userId, user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "Connector not found." }, { status: 404 });

  if (action === "connect") {
    // Run connection in the background; return immediately so the request
    // doesn't time out on slow SSE handshakes. UI polls for status.
    void connectMcp(id, row.url, row.name).catch((e) =>
      console.error(`[mcp] connect failed:`, e),
    );
    return NextResponse.json({ connection: { status: "connecting" } });
  }
  if (action === "disconnect") {
    await disconnectMcp(id);
    return NextResponse.json({ ok: true, status: "disconnected" });
  }
  if (action === "status") {
    return NextResponse.json({ connected: isMcpConnected(id), tools: row.tools });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await disconnectMcp(id).catch(() => {});
  await db
    .delete(mcpConnectors)
    .where(and(eq(mcpConnectors.id, id), eq(mcpConnectors.userId, user.id)));
  return NextResponse.json({ ok: true });
}
