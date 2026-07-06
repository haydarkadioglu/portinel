import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { apiKeys, auditLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser, getRequestIp } from "@/lib/session";
import { generateApiKey } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      requests: apiKeys.requests,
      ratePerHour: apiKeys.ratePerHour,
      revoked: apiKeys.revoked,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, user.id))
    .orderBy(desc(apiKeys.createdAt));
  return NextResponse.json({ keys });
}

const schema = z.object({
  name: z.string().min(2).max(40),
  ratePerHour: z.number().min(1).max(10000).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { raw, prefix, hash } = generateApiKey();
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId: user.id,
      name: parsed.data.name,
      keyPrefix: prefix,
      keyHash: hash,
      ratePerHour: parsed.data.ratePerHour ?? 100,
    })
    .returning({ id: apiKeys.id });

  await db.insert(auditLogs).values({
    userId: user.id,
    action: "apikey.create",
    resource: "api_key",
    resourceId: row.id,
    ip: await getRequestIp(),
  });

  return NextResponse.json({ id: row.id, key: raw, prefix }, { status: 201 });
}
