import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { scheduledScans } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { scanRequestSchema, coerceScanTypes } from "@/lib/validation";
import { computeNextRun } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await db
    .select()
    .from(scheduledScans)
    .where(eq(scheduledScans.userId, user.id))
    .orderBy(desc(scheduledScans.createdAt));
  return NextResponse.json({ items: rows });
}

const schema = z.object({
  target: z.string().min(1).max(253),
  scanTypes: z.array(z.string()).min(1),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const parsed = scanRequestSchema.extend({
    frequency: z.enum(["daily", "weekly", "monthly"]).default("weekly"),
  }).safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const [row] = await db
    .insert(scheduledScans)
    .values({
      userId: user.id,
      target: parsed.data.target,
      scanTypes: coerceScanTypes(parsed.data.scanTypes),
      frequency: parsed.data.frequency,
      nextRunAt: computeNextRun(parsed.data.frequency),
    })
    .returning();
  return NextResponse.json({ item: row }, { status: 201 });
}
