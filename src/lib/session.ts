// ============================================================================
// session.ts — Server-only session / authorization helpers.
//
// Primary auth: Supabase Auth (cookie-based SSR sessions via @supabase/ssr).
// Fallback: demo bypass mode (local DB identity) for sandbox/development when
// Supabase isn't configured or a session hasn't been established.
// ============================================================================
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, apiKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hashApiKey } from "./auth";
import { ensureBootstrap } from "./bootstrap";
import { getSupabaseServer, isSupabaseConfigured } from "./supabase-clients";
import type { Role } from "./rbac";
import { hasPermission, type Permission } from "./rbac";

// Demo bypass is DISABLED in production — all requests require a real
// Supabase Auth session. (Set to true only for local sandbox testing.)
export const DEMO_BYPASS = false;
const DEMO_EMAIL = "admin@portinel.io";

export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: string;
  plan: string;
  status: string;
  title: string | null;
  company: string | null;
  avatarColor: string | null;
  scanCount: number;
  createdAt: Date;
  lastLoginAt: Date | null;
  authSource: "supabase" | "demo";
}

function mapUser(u: typeof users.$inferSelect, source: "supabase" | "demo" = "supabase"): SafeUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    plan: u.plan,
    status: u.status,
    title: u.title,
    company: u.company,
    avatarColor: u.avatarColor,
    scanCount: u.scanCount,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
    authSource: source,
  };
}

// ---------------------------------------------------------------------------
// Demo user (fallback when no Supabase session)
// ---------------------------------------------------------------------------
let demoUserCache: SafeUser | null = null;

export async function getDemoUser(): Promise<SafeUser> {
  if (demoUserCache) return demoUserCache;
  await ensureBootstrap().catch(() => {});
  let [u] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (!u) {
    [u] = await db
      .insert(users)
      .values({
        email: DEMO_EMAIL,
        name: "Portinel Admin",
        role: "admin",
        plan: "enterprise",
        title: "Platform Administrator",
        company: "Portinel",
        avatarColor: "#a855f7",
        passwordHash: "supabase-auth",
      })
      .returning();
  }
  demoUserCache = mapUser(u, "demo");
  return demoUserCache;
}

// ---------------------------------------------------------------------------
// Sync a Supabase auth user into our local users table.
// ---------------------------------------------------------------------------
async function syncSupabaseUser(supabaseUser: {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  last_sign_in_at?: string | null;
}): Promise<SafeUser | null> {
  const meta = supabaseUser.user_metadata || {};
  const role = (meta.role as string) || "viewer";
  const name = (meta.name as string) || (meta.full_name as string) || supabaseUser.email.split("@")[0];

  // Upsert into local DB.
  const [existing] = await db.select().from(users).where(eq(users.id, supabaseUser.id)).limit(1);
  if (existing) {
    // Update last login, keep role from DB if already set by admin.
    const [updated] = await db
      .update(users)
      .set({
        email: supabaseUser.email,
        name: meta.name ? (meta.name as string) : existing.name,
        lastLoginAt: supabaseUser.last_sign_in_at ? new Date(supabaseUser.last_sign_in_at) : new Date(),
      })
      .where(eq(users.id, supabaseUser.id))
      .returning();
    return mapUser(updated);
  }

  // New user — create local profile.
  const colors = ["#22d3ee", "#818cf8", "#a855f7", "#34d399", "#fb7185", "#fbbf24"];
  const [created] = await db
    .insert(users)
    .values({
      id: supabaseUser.id,
      email: supabaseUser.email,
      name,
      role,
      plan: "free",
      title: (meta.title as string) || null,
      company: (meta.company as string) || null,
      avatarColor: (meta.avatarColor as string) || colors[Math.floor(Math.random() * colors.length)],
      passwordHash: "supabase-auth",
    })
    .returning();
  return mapUser(created);
}

// ---------------------------------------------------------------------------
// Get the current authenticated user (Supabase → demo fallback)
// ---------------------------------------------------------------------------
export async function getCurrentUser(): Promise<SafeUser | null> {
  // Try Supabase Auth session first.
  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabaseServer();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const local = await syncSupabaseUser({
          id: user.id,
          email: user.email || "",
          user_metadata: user.user_metadata as Record<string, unknown>,
          created_at: user.created_at,
          last_sign_in_at: user.last_sign_in_at,
        });
        if (local && local.status === "active") return local;
        if (local && local.status !== "active") return null; // suspended
      }
    } catch {
      /* Supabase error — fall through to demo */
    }
  }

  // Fallback: demo bypass mode (disabled in production).
  if (DEMO_BYPASS) return getDemoUser();
  // No session — unauthenticated.
  return null;
}

export async function requireUser(redirectTo = "/login"): Promise<SafeUser> {
  const u = await getCurrentUser();
  if (!u) redirect(redirectTo);
  return u;
}

export async function requireRole(...roles: Role[]): Promise<SafeUser> {
  const u = await requireUser();
  if (!roles.includes(u.role as Role)) redirect("/dashboard");
  return u;
}

export async function requireAdmin(): Promise<SafeUser> {
  return requireRole("admin");
}

/** Check a permission against the current user's role. */
export async function requirePermission(permission: Permission): Promise<SafeUser> {
  const u = await requireUser();
  if (!hasPermission(u.role, permission)) redirect("/dashboard");
  return u;
}

export async function getRequestIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "127.0.0.1"
  );
}

// Authenticate an API request via Supabase session OR X-API-Key header.
export async function authenticateRequest(
  req: Request,
): Promise<{ user: SafeUser | null; via: "session" | "apikey" | "none" }> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey?.startsWith("pt_live_")) {
    const hash = hashApiKey(apiKey);
    const [row] = await db
      .select({ apiKeys, users })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.revoked, false)))
      .limit(1);
    if (row && row.users.status === "active") {
      await db
        .update(apiKeys)
        .set({ lastUsedAt: new Date(), requests: row.apiKeys.requests + 1 })
        .where(eq(apiKeys.id, row.apiKeys.id));
      return { user: mapUser(row.users), via: "apikey" };
    }
  }
  const user = await getCurrentUser();
  if (user) return { user, via: "session" };
  return { user: null, via: "none" };
}
