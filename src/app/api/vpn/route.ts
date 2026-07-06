import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vpnConfigs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { getCurrentUser } from "@/lib/session";
import { encryptConfig, parseOvpn, validateOvpn, isOpenVpnAvailable } from "@/lib/vpn";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [rows, available] = await Promise.all([
    db
      .select({
        id: vpnConfigs.id,
        name: vpnConfigs.name,
        remoteHost: vpnConfigs.remoteHost,
        remotePort: vpnConfigs.remotePort,
        remoteProto: vpnConfigs.remoteProto,
        connectionStatus: vpnConfigs.connectionStatus,
        tunnelIp: vpnConfigs.tunnelIp,
        lastConnectedAt: vpnConfigs.lastConnectedAt,
        createdAt: vpnConfigs.createdAt,
      })
      .from(vpnConfigs)
      .where(eq(vpnConfigs.userId, user.id))
      .orderBy(desc(vpnConfigs.createdAt)),
    isOpenVpnAvailable(),
  ]);
  return NextResponse.json({ items: rows, openvpnAvailable: available });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const name = (form.get("name") as string | null)?.trim();

  if (!file) return NextResponse.json({ error: "No .ovpn file uploaded." }, { status: 400 });
  const content = await file.text();
  const valid = validateOvpn(content);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });

  const parsed = parseOvpn(content);
  const encrypted = encryptConfig(content);

  const [row] = await db
    .insert(vpnConfigs)
    .values({
      userId: user.id,
      name: name || parsed.remoteHost || file.name.replace(/\.ovpn$/i, ""),
      remoteHost: parsed.remoteHost,
      remotePort: parsed.remotePort,
      remoteProto: parsed.remoteProto || parsed.protocol,
      encryptedConfig: encrypted,
      connectionStatus: "disconnected",
    })
    .returning({ id: vpnConfigs.id });

  return NextResponse.json(
    { item: row, parsed },
    { status: 201 },
  );
}
