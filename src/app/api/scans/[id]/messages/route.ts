import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatMessages } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { getScan } from "@/lib/scan-service";

export const dynamic = "force-dynamic";

// Load persisted conversation history for a scan.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  // Verify ownership of the scan.
  const scan = await getScan(id, user.id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

  const rows = await db
    .select()
    .from(chatMessages)
    .where(and(eq(chatMessages.scanId, id), eq(chatMessages.userId, user.id)));
  return NextResponse.json({
    items: rows.map((r) => ({
      id: r.id,
      role: r.role,
      content: r.content,
      provider: r.provider,
      toolsUsed: r.toolsUsed,
      ts: r.createdAt.getTime(),
    })),
  });
}

// Persist a message (called after a chat exchange completes).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const scan = await getScan(id, user.id);
  if (!scan) return NextResponse.json({ error: "Scan not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const { messages } = body || {};
  if (!Array.isArray(messages))
    return NextResponse.json({ error: "messages array required." }, { status: 400 });

  const inserted = [];
  for (const m of messages.slice(-2)) {
    // persist last user + assistant pair
    if (!m?.role || !m?.content) continue;
    const [row] = await db
      .insert(chatMessages)
      .values({
        scanId: id,
        userId: user.id,
        role: String(m.role),
        content: String(m.content).slice(0, 20000),
        provider: m.provider || null,
        toolsUsed: m.toolsUsed || null,
      })
      .returning({ id: chatMessages.id });
    inserted.push(row.id);
  }
  return NextResponse.json({ ok: true, ids: inserted });
}
