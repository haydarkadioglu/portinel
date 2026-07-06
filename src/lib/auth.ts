// ============================================================================
// auth.ts — Edge-safe authentication primitives.
// Deliberately free of `next/headers` / database imports so the same code can
// run in middleware (edge) and route handlers (node).
// ============================================================================
import { SignJWT, jwtVerify } from "jose";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "crypto";

export const COOKIE_NAME = "portinel_session";
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  "portinel-dev-secret-change-in-production-0123456789abcdef";

const encoder = new TextEncoder();
const secretKey = encoder.encode(AUTH_SECRET);

// ---------------------------------------------------------------------------
// Password hashing (scrypt — no external dependency)
// ---------------------------------------------------------------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const hash = Buffer.from(parts[2], "hex");
  const test = scryptSync(password, salt, 64);
  if (hash.length !== test.length) return false;
  return timingSafeEqual(hash, test);
}

// ---------------------------------------------------------------------------
// Session tokens (JWT, HS256)
// ---------------------------------------------------------------------------
export interface SessionClaims {
  sub: string;
  email: string;
  name: string;
  role: string;
  plan: string;
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secretKey);
}

export async function verifyToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as string,
      plan: payload.plan as string,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// API keys — format: pt_live_<32 hex>. Stored as sha256 hash.
// ---------------------------------------------------------------------------
export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `pt_live_${randomBytes(24).toString("hex")}`;
  return {
    raw,
    prefix: raw.slice(0, 12),
    hash: hashApiKey(raw),
  };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
