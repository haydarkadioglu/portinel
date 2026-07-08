import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatSessions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// DELETE /api/chat/sessions/[id]: delete session (messages are deleted via cascade references)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    await db
      .delete(chatSessions)
      .where(and(eq(chatSessions.id, id), eq(chatSessions.userId, user.id)));

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[chat sessions DELETE] failed:", err);
    return NextResponse.json({ error: "Failed to delete chat session." }, { status: 500 });
  }
}
