import { NextResponse } from "next/server";
import { getSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-clients";

export const dynamic = "force-dynamic";

export async function POST() {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabaseServer();
      await supabase.auth.signOut();
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true });
}
