// ============================================================================
// middleware.ts — Master branch (no login required).
//
// Demo bypass is ON — every request is authenticated as the default admin at
// the application layer. No redirects, no auth gate.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(_req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
