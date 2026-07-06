import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-clients";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { auditLogs } from "@/db/schema";
import { rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
  const limited = rateLimit(`login:${ip}`, 10, 0.5);
  if (!limited.ok)
    return NextResponse.json({ error: "Too many login attempts. Slow down." }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });

  if (!isSupabaseConfigured())
    return NextResponse.json({ error: "Supabase is not configured. Use demo bypass mode." }, { status: 503 });

  try {
    const supabase = await getSupabaseServer();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (error || !data.user) {
      await safeAudit({ action: "user.login", status: "failed", ip, metadata: { email: parsed.data.email } });
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }

    // Check if user is active in our local DB.
    const [localUser] = await db.select().from(users).where(eq(users.id, data.user.id)).limit(1);
    if (localUser && localUser.status !== "active") {
      // Sign out — account suspended.
      await supabase.auth.signOut();
      return NextResponse.json({ error: "Account suspended. Contact an administrator." }, { status: 403 });
    }

    await safeAudit({
      userId: data.user.id,
      action: "user.login",
      status: "success",
      ip,
    });

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
        name: data.user.user_metadata?.name || data.user.email?.split("@")[0],
        role: data.user.user_metadata?.role || localUser?.role || "viewer",
      },
    });
  } catch (err) {
    console.error("[auth/login] error:", err);
    return NextResponse.json(
      { error: "Authentication service is unavailable." },
      { status: 503 },
    );
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
