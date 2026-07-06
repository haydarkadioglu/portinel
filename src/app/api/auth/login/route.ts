import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { verifyPassword } from "@/lib/auth";
import { setSessionCookie, getRequestIp } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { ensureBootstrap } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  await ensureBootstrap();
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const limited = rateLimit(`login:${ip}`, 10, 0.5);
  if (!limited.ok)
    return NextResponse.json({ error: "Too many login attempts. Slow down." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      await safeAudit({ action: "user.login", status: "failed", ip, metadata: { email: parsed.data.email } });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    if (user.status !== "active")
      return NextResponse.json({ error: "Account suspended. Contact an administrator." }, { status: 403 });

    await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
    await setSessionCookie({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      plan: user.plan,
    });

    const reqIp = await getRequestIp();
    await safeAudit({ userId: user.id, action: "user.login", status: "success", ip: reqIp });

    return NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    console.error("[auth/login] error:", err);
    return NextResponse.json({ error: "Authentication service is unavailable." }, { status: 503 });
  }
}

async function safeAudit(values: {
  userId?: string;
  action: string;
  status?: string;
  ip?: string;
  metadata?: unknown;
}) {
  try {
    await db.insert(auditLogs).values({
      userId: values.userId,
      action: values.action,
      resource: "auth",
      status: values.status,
      ip: values.ip,
      metadata: values.metadata as never,
    });
  } catch { /* non-critical */ }
}
