import { requireUser } from "@/lib/session";
import { Card, SectionTitle } from "@/components/ui";
import { McpConnectorsPanel } from "@/components/mcp-connectors";

export const dynamic = "force-dynamic";

export default async function ConnectorsPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">MCP connectors</h1>
        <p className="text-sm text-muted">
          Connect external tool servers (SSE MCP). Connected tools become available to the AI chat and can be invoked directly.
        </p>
      </div>

      <Card>
        <SectionTitle
          title="Tool servers"
          subtitle="SSE transport · auto-discovers tools on connect"
          icon={<span>🔌</span>}
        />
        <McpConnectorsPanel />
      </Card>
    </div>
  );
}
