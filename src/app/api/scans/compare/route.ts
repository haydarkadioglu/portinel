import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getScan, diffScans } from "@/lib/scan-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const a = searchParams.get("a");
  const b = searchParams.get("b");
  if (!a || !b)
    return NextResponse.json({ error: "Provide ?a=&b= scan ids" }, { status: 400 });

  const before = await getScan(a, user.id);
  const after = await getScan(b, user.id);
  if (!before || !after)
    return NextResponse.json({ error: "Scan(s) not found" }, { status: 404 });

  return NextResponse.json({ diff: diffScans(before, after) });
}
