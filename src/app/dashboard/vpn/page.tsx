import { requireUser } from "@/lib/session";
import { Card, SectionTitle } from "@/components/ui";
import { VpnManager } from "@/components/vpn-manager";

export const dynamic = "force-dynamic";

export default async function VpnPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">VPN tunnels</h1>
        <p className="text-sm text-muted">
          Connect into a target LAN with an OpenVPN profile, then scan internal hosts from inside the network.
        </p>
      </div>

      <Card>
        <SectionTitle
          title="OpenVPN profiles"
          subtitle="Encrypted at rest · connect to scan RFC1918 / internal ranges"
          icon={<span>📡</span>}
        />
        <VpnManager />
      </Card>
    </div>
  );
}
