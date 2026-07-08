import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServer, isSupabaseConfigured } from "@/lib/supabase-clients";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (isSupabaseConfigured()) {
    try {
      const supabase = await getSupabaseServer();
      await supabase.auth.signOut();
    } catch { /* ignore */ }
  }
  return NextResponse.redirect(new URL("/", req.url), 303);
}
