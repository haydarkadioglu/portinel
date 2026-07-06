import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";
import { setSessionCookie, getRequestIp } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { ensureBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

const schema = z.object({
  name: z.string().min(2).max(60),
  email: z.string().email().toLowerCase(),
  password: z.string().min(8).max(128),
  company: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  await ensureBootstrap();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const limited = rateLimit(`register:${ip}`, 5, 0.2);
  if (!limited.ok)
    return NextResponse.json({ error: "Too many attempts." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { name, email, password, company } = parsed.data;

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing)
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });

  const colors = ["#22d3ee", "#818cf8", "#a855f7", "#34d399", "#fb7185", "#fbbf24"];
  const [user] = await db
    .insert(users)
    .values({
      name,
      email,
      passwordHash: hashPassword(password),
      company,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
    })
    .returning();

  await setSessionCookie({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
  });

  const reqIp = await getRequestIp();
  await db.insert(auditLogs).values({
    userId: user.id,
    action: "user.register",
    resource: "user",
    resourceId: user.id,
    ip: reqIp,
    status: "success",
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
}
