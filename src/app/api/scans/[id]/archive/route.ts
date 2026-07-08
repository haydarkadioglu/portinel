import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { scans } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await db
      .update(scans)
      .set({ archived: true })
      .where(and(eq(scans.id, id), eq(scans.userId, user.id)));

    return NextResponse.redirect(new URL("/dashboard/scans", req.url), 303);
  } catch (err) {
    console.error("[archive] error:", err);
    return NextResponse.json({ error: "Failed to archive scan." }, { status: 500 });
  }
}
