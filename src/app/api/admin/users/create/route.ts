import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { ROLES, isValidRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(8),
  name: z.string().min(2).max(60),
  role: z.string().refine(isValidRole, "Invalid role"),
  title: z.string().max(80).optional(),
  company: z.string().max(80).optional(),
});

export async function GET() {
  await requireAdmin();
  return NextResponse.json({ roles: ROLES });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const [existing] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
  if (existing)
    return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });

  const colors = ["#22d3ee", "#818cf8", "#a855f7", "#34d399", "#fb7185", "#fbbf24"];
  const [user] = await db
    .insert(users)
    .values({
      email: parsed.data.email,
      passwordHash: hashPassword(parsed.data.password),
      name: parsed.data.name,
      role: parsed.data.role,
      title: parsed.data.title || null,
      company: parsed.data.company || null,
      avatarColor: colors[Math.floor(Math.random() * colors.length)],
    })
    .returning();

  await db.insert(auditLogs).values({
    userId: admin.id,
    action: "user.create",
    resource: "user",
    resourceId: user.id,
    status: "success",
    metadata: { email: parsed.data.email, role: parsed.data.role },
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    message: `Account created for ${parsed.data.email} with role "${parsed.data.role}".`,
  }, { status: 201 });
}
