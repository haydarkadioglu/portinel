import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vpnConfigs } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { connectVpn, disconnectVpn, decryptConfig, maskConfig } from "@/lib/vpn";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body.action;

  // Verify ownership.
  const [row] = await db
    .select()
    .from(vpnConfigs)
    .where(and(eq(vpnConfigs.id, id), eq(vpnConfigs.userId, user.id)))
    .limit(1);
  if (!row) return NextResponse.json({ error: "VPN config not found." }, { status: 404 });

  if (action === "connect") {
    const result = await connectVpn(id);
    return NextResponse.json(result);
  }
  if (action === "disconnect") {
    await disconnectVpn(id);
    return NextResponse.json({ ok: true, status: "disconnected", message: "Disconnected." });
  }
  if (action === "preview") {
    const content = decryptConfig(row.encryptedConfig);
    return NextResponse.json({ config: maskConfig(content) });
  }
  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await disconnectVpn(id).catch(() => {});
  await db
    .delete(vpnConfigs)
    .where(and(eq(vpnConfigs.id, id), eq(vpnConfigs.userId, user.id)));
  return NextResponse.json({ ok: true });
}
