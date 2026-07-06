import { NextResponse } from "next/server";
import { db } from "@/db";
import { scans, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const rows = await db
    .select({
      id: scans.id,
      target: scans.target,
      targetType: scans.targetType,
      status: scans.status,
      riskScore: scans.riskScore,
      grade: scans.grade,
      openPortCount: scans.openPortCount,
      createdAt: scans.createdAt,
      userEmail: users.email,
      userName: users.name,
    })
    .from(scans)
    .leftJoin(users, eq(scans.userId, users.id))
    .orderBy(desc(scans.createdAt))
    .limit(60);
  return NextResponse.json({ scans: rows });
}
