// ============================================================================
// session.ts — LOCAL-ONLY session / authorization helpers (master branch).
//
// Uses JWT-based auth (jose) + scrypt password hashing. No Supabase dependency.
// Fully self-contained — works with just PostgreSQL + the .env AUTH_SECRET.
// ============================================================================
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users, apiKeys } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import {
  COOKIE_NAME,
  createSessionToken,
  hashApiKey,
  hashPassword,
  verifyToken,
  type SessionClaims,
} from "./auth";
import { ensureBootstrap } from "./bootstrap";
import type { Role } from "./rbac";
import { hasPermission, type Permission } from "./rbac";

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
}

function mapUser(u: typeof users.$inferSelect): SafeUser {
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
  };
}

export async function getCurrentUser(): Promise<SafeUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const claims = await verifyToken(token);
  if (!claims) return null;
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.id, claims.sub))
    .limit(1);
  if (!u || u.status !== "active") return null;
  return mapUser(u);
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

export async function requirePermission(permission: Permission): Promise<SafeUser> {
  const u = await requireUser();
  if (!hasPermission(u.role, permission)) redirect("/dashboard");
  return u;
}

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await createSessionToken(claims);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getRequestIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "127.0.0.1"
  );
}

// Authenticate an API request via session cookie OR X-API-Key header.
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
