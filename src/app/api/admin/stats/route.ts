import { NextResponse } from "next/server";
import { db } from "@/db";
import { users, scans } from "@/db/schema";
import { sql, eq, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();

  const [[u], [s], [done], [avgRisk], recentScans, topTargets, statusRows, newUsers] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    db.select({ count: sql<number>`count(*)::int` }).from(scans),
    db.select({ count: sql<number>`count(*)::int` }).from(scans).where(eq(scans.status, "completed")),
    db.select({ avg: sql<number>`coalesce(avg(risk_score),0)::int` }).from(scans).where(eq(scans.status, "completed")),
    db.select().from(scans).orderBy(desc(scans.createdAt)).limit(8),
    db
      .select({ target: scans.target, count: sql<number>`count(*)::int` })
      .from(scans)
      .groupBy(scans.target)
      .orderBy(desc(sql`count(*)`))
      .limit(6),
    db
      .select({ status: scans.status, count: sql<number>`count(*)::int` })
      .from(scans)
      .groupBy(scans.status),
    db.select().from(users).orderBy(desc(users.createdAt)).limit(5),
  ]);

  return NextResponse.json({
    totals: {
      users: u?.count ?? 0,
      scans: s?.count ?? 0,
      completed: done?.count ?? 0,
      avgRisk: avgRisk?.avg ?? 0,
    },
    recentScans,
    topTargets,
    statusBreakdown: statusRows,
    newUsers,
  });
}
