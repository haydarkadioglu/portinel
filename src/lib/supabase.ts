// ============================================================================
// supabase.ts — Supabase integration (mirrors MCP execution logs).
//
// Uses the publishable (anon) key for client-compatible reads/writes. For
// privileged server-side writes that bypass RLS, set SUPABASE_SERVICE_ROLE_KEY.
// All writes are best-effort — failures never break the main flow.
// ============================================================================
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  if (!client) {
    client = createClient(url, serviceKey || anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function isSupabaseConfigured(): boolean {
  return !!(url && anonKey);
}

/** Best-effort insert into a Supabase table. Never throws. */
export async function logToSupabase(table: string, row: Record<string, unknown>): Promise<void> {
  const c = getClient();
  if (!c) return;
  try {
    await c.from(table).insert(row);
  } catch (err) {
    // RLS or table-missing — non-fatal. Logged server-side only.
    console.warn(`[supabase] insert into ${table} failed:`, err instanceof Error ? err.message : err);
  }
}

/** Read recent rows from a Supabase table (best-effort). */
export async function readFromSupabase(
  table: string,
  limit = 50,
): Promise<unknown[] | null> {
  const c = getClient();
  if (!c) return null;
  try {
    const { data, error } = await c
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data ?? [];
  } catch (err) {
    console.warn(`[supabase] read from ${table} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}
