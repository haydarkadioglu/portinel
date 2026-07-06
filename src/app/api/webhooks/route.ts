import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { webhooks } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select({
      id: webhooks.id,
      name: webhooks.name,
      url: webhooks.url,
      events: webhooks.events,
      enabled: webhooks.enabled,
      lastFiredAt: webhooks.lastFiredAt,
      lastStatus: webhooks.lastStatus,
      deliveryCount: webhooks.deliveryCount,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.userId, user.id))
    .orderBy(desc(webhooks.createdAt));
  return NextResponse.json({ items: rows });
}

const schema = z.object({
  name: z.string().min(2).max(40),
  url: z.string().url(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const [row] = await db
    .insert(webhooks)
    .values({ userId: user.id, name: parsed.data.name, url: parsed.data.url })
    .returning();
  return NextResponse.json({ item: row }, { status: 201 });
}
