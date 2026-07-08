import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { chatSessions } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

// GET /api/chat/sessions: list sessions
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const list = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.userId, user.id))
      .orderBy(desc(chatSessions.createdAt));

    return NextResponse.json({ sessions: list });
  } catch (err) {
    console.error("[chat sessions GET] failed:", err);
    return NextResponse.json({ error: "Failed to load chat sessions." }, { status: 500 });
  }
}

// POST /api/chat/sessions: create a new session
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "New Chat";

    const [row] = await db
      .insert(chatSessions)
      .values({
        userId: user.id,
        title,
      })
      .returning();

    return NextResponse.json({ session: row }, { status: 201 });
  } catch (err) {
    console.error("[chat sessions POST] failed:", err);
    return NextResponse.json({ error: "Failed to create chat session." }, { status: 500 });
  }
}
