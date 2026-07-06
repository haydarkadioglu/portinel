import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getCurrentUser, getRequestIp } from "@/lib/session";
import { rateLimit } from "@/lib/ratelimit";
import { scanRequestSchema, coerceScanTypes } from "@/lib/validation";
import { createScan, listScans, ServiceError } from "@/lib/scan-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 25), 100);
  const offset = Number(searchParams.get("offset") || 0);
  const target = searchParams.get("target") || undefined;

  const items = await listScans(user.id, { limit, offset, target });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limited = rateLimit(`scan:${user.id}`, 20, 0.5);
  if (!limited.ok)
    return NextResponse.json(
      { error: "Rate limit reached. Please wait before scanning again." },
      { status: 429, headers: { "retry-after": String(Math.ceil(limited.retryAfterMs / 1000)) } },
    );

  const body = await req.json().catch(() => null);
  const parsed = scanRequestSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const scanTypes = coerceScanTypes(parsed.data.scanTypes);
  const parentId = typeof body?.parentId === "string" ? body.parentId : undefined;
  const label = typeof body?.label === "string" ? body.label : undefined;

  try {
    // createScan enqueues a background worker and returns immediately.
    const record = await createScan(user.id, {
      target: parsed.data.target,
      scanTypes,
      ports: parsed.data.ports,
      intensity: parsed.data.intensity,
      parentId,
      label,
    });

    const ip = await getRequestIp();
    await db.insert(auditLogs).values({
      userId: user.id,
      action: "scan.create",
      resource: "scan",
      resourceId: record.id,
      ip,
      status: "success",
      metadata: { target: parsed.data.target },
    });

    return NextResponse.json({ scan: record }, { status: 202 });
  } catch (err) {
    const status = err instanceof ServiceError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Scan failed.";
    return NextResponse.json({ error: message }, { status });
  }
}
