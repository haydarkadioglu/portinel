import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase-clients";
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

// GET: return available roles for the admin form.
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

  if (!isSupabaseConfigured())
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin)
    return NextResponse.json({
      error: "SUPABASE_SERVICE_ROLE_KEY is required for user management. Set it in .env to create Supabase Auth users.",
    }, { status: 503 });

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      email_confirm: true, // skip email verification
      user_metadata: {
        name: parsed.data.name,
        role: parsed.data.role,
        title: parsed.data.title || null,
        company: parsed.data.company || null,
      },
    });

    if (error || !data.user)
      return NextResponse.json({ error: error?.message || "Failed to create user." }, { status: 422 });

    return NextResponse.json({
      user: { id: data.user.id, email: data.user.email },
      message: `Account created for ${parsed.data.email} with role "${parsed.data.role}". They can now sign in.`,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : "User creation failed.",
    }, { status: 500 });
  }
}
