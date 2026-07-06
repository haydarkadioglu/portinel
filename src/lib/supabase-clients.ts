// ============================================================================
// supabase-clients.ts — Supabase SSR clients for App Router.
//
// Uses @supabase/ssr for cookie-based session management. Provides:
//   • createServerClient() — for server components & route handlers
//   • Middleware client helper — for middleware/proxy
//   • Admin client — for user management (requires service role key)
// ============================================================================
import { createServerClient as createSSRClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";
}

export function getSupabaseServiceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

export function isSupabaseConfigured(): boolean {
  return !!(getSupabaseUrl() && getSupabaseAnonKey());
}

/** Server component / route handler client (reads session from cookies). */
export async function getSupabaseServer() {
  const store = await cookies();
  return createSSRClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore since middleware
          // will refresh the session.
        }
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Admin client for user management (create/list/delete users). */
export function getSupabaseAdmin() {
  const serviceKey = getSupabaseServiceKey();
  if (!serviceKey) return null;
  return createClient(getSupabaseUrl(), serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
