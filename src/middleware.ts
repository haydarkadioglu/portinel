// ============================================================================
// middleware.ts — Authentication gate + Supabase session refresh.
//
// Production mode: unauthenticated requests to protected routes are redirected
// to /login. Public routes (landing, login, shared reports, health) are allowed.
// ============================================================================
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "";

const DEMO_BYPASS = false;

// Routes that don't require authentication.
const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
  "/api/health",
];
const PUBLIC_PREFIXES = ["/r/", "/api/health"];

function isPublicRoute(pathname: string): boolean {
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let res = NextResponse.next({
    request: { headers: req.headers },
  });

  // If Supabase is not configured, fall back to permissive mode (app-level
  // auth in session.ts handles it). This keeps the app bootable.
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || DEMO_BYPASS) {
    return res;
  }

  // Refresh Supabase session cookies.
  let hasSession = false;
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            req.cookies.set(name, value);
            res.cookies.set(name, value, options);
          });
        },
      },
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    hasSession = !!user;
  } catch {
    /* ignore — treat as unauthenticated */
  }

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

  return res;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
