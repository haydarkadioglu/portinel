import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { apiKeys, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { hashApiKey } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { scanRequestSchema, coerceScanTypes } from "@/lib/validation";
import { createScan, listScans } from "@/lib/scan-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AuthResult { userId: string; via: "session" | "apikey"; ok: boolean; status?: number; error?: string; }

async function authV1(req: NextRequest): Promise<AuthResult> {
  const apiKey = req.headers.get("x-api-key");
  if (apiKey?.startsWith("pt_live_")) {
    const hash = hashApiKey(apiKey);
    const [row] = await db
      .select({ apiKeys, users })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.userId, users.id))
      .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.revoked, false)))
      .limit(1);
    if (!row || row.users.status !== "active")
      return { userId: "", via: "apikey", ok: false, status: 401, error: "Invalid or revoked API key." };
    const cap = row.apiKeys.ratePerHour || 100;
    const limited = rateLimit(`v1key:${row.apiKeys.id}`, cap, cap / 3600);
    if (!limited.ok)
      return { userId: "", via: "apikey", ok: false, status: 429, error: "API rate limit exceeded." };
    await db
      .update(apiKeys)
      .set({ lastUsedAt: new Date(), requests: row.apiKeys.requests + 1 })
      .where(eq(apiKeys.id, row.apiKeys.id));
    return { userId: row.users.id, via: "apikey", ok: true };
  }
  const user = await getCurrentUser();
  if (!user)
    return { userId: "", via: "session", ok: false, status: 401, error: "Authenticate with X-API-Key or a session cookie." };
  const limited = rateLimit(`v1:${user.id}`, 120, 2);
  if (!limited.ok)
    return { userId: "", via: "session", ok: false, status: 429, error: "API rate limit exceeded." };
  return { userId: user.id, via: "session", ok: true };
}

export async function GET(req: NextRequest) {
  const auth = await authV1(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 25), 100);
  const items = await listScans(auth.userId, { limit });
  return NextResponse.json({ scans: items });
}

export async function POST(req: NextRequest) {
  const auth = await authV1(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = await req.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  try {
    const scan = await createScan(auth.userId, {
      target: parsed.data.target,
      scanTypes: coerceScanTypes(parsed.data.scanTypes),
      ports: parsed.data.ports,
      intensity: parsed.data.intensity,
    });
    return NextResponse.json({ scan }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scan failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
