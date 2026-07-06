// ============================================================================
// middleware.ts — LOCAL auth gate (master branch, no Supabase).
//
// Verifies the local JWT cookie. Unauthenticated requests to protected routes
// are redirected to /login. Public routes pass through.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth";

const PUBLIC_ROUTES = ["/login", "/register", "/api/auth/login", "/api/auth/register", "/api/health"];
const PUBLIC_PREFIXES = ["/r/", "/api/health"];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  const claims = token ? await verifyToken(token) : null;
  const hasSession = !!claims;

  const isPublic = isPublicRoute(pathname);

  // Unauthenticated user trying to access a protected route.
  if (!hasSession && !isPublic) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized — authentication required." },
        { status: 401 },
      );
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Authenticated user visiting login → redirect to dashboard.
  if (hasSession && pathname === "/login") {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (claims) res.headers.set("x-portinel-user", claims.sub);
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
