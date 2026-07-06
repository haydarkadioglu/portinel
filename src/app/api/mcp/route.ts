import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { mcpConnectors } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { connectMcp } from "@/lib/mcp";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select()
    .from(mcpConnectors)
    .where(eq(mcpConnectors.userId, user.id))
    .orderBy(desc(mcpConnectors.createdAt));
  return NextResponse.json({ items: rows });
}

const schema = z.object({
  name: z.string().min(2).max(60),
  url: z.string().url(),
  autoConnect: z.boolean().optional(),
  connect: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const [row] = await db
    .insert(mcpConnectors)
    .values({
      userId: user.id,
      name: parsed.data.name,
      url: parsed.data.url,
      autoConnect: parsed.data.autoConnect ?? false,
      status: parsed.data.connect === false ? "disconnected" : "connecting",
    })
    .returning();

  // Kick off the SSE connection in the background so the request returns
  // immediately. The UI polls /api/mcp/<id> for status.
  if (parsed.data.connect !== false) {
    void connectMcp(row.id, parsed.data.url, parsed.data.name).catch((e) =>
      console.error(`[mcp] background connect failed:`, e),
    );
  }
  return NextResponse.json({ item: row, connection: { status: "connecting" } }, { status: 201 });
}
