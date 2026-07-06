import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";
import { isValidRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const schema = z.object({
  role: z.string().refine(isValidRole, "Invalid role").optional(),
  status: z.enum(["active", "suspended"]).optional(),
  plan: z.enum(["free", "pro", "enterprise"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const patch: Record<string, string> = {};
  if (parsed.data.role) patch.role = parsed.data.role;
  if (parsed.data.status) patch.status = parsed.data.status;
  if (parsed.data.plan) patch.plan = parsed.data.plan;
  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  // Update local DB.
  await db.update(users).set(patch).where(eq(users.id, id));

  return NextResponse.json({ ok: true, by: admin.id });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (id === admin.id)
    return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
  await db.delete(users).where(eq(users.id, id));
  return NextResponse.json({ ok: true });
}
