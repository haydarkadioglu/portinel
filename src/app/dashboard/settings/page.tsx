import { requireUser } from "@/lib/session";
import { Card, SectionTitle, Avatar } from "@/components/ui";
import { ApiKeys } from "@/components/api-keys";
import { WebhooksManager } from "@/components/webhooks-manager";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted">Manage your profile and API access.</p>
      </div>

      <Card>
        <SectionTitle title="Profile" icon={<span>👤</span>} />
        <div className="flex items-center gap-4">
          <Avatar name={user.name} color={user.avatarColor} size={56} />
          <div>
            <div className="font-semibold">{user.name}</div>
            <div className="text-sm text-muted">{user.email}</div>
            <div className="mt-1 flex gap-2">
              <span className="badge sev-low capitalize">{user.plan} plan</span>
              <span className="badge sev-info capitalize">{user.role}</span>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <Info label="Title" value={user.title || "—"} />
          <Info label="Company" value={user.company || "—"} />
          <Info label="Member since" value={formatDateTime(user.createdAt)} />
          <Info label="Total scans" value={`${user.scanCount}`} />
          <Info label="Last login" value={user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "—"} />
          <Info label="Status" value={user.status} />
        </div>
      </Card>

      <Card>
        <SectionTitle title="API keys" subtitle="Programmatic access to the Portinel API" icon={<span>🔑</span>} />
        <ApiKeys />
      </Card>

      <Card>
        <SectionTitle title="Webhooks" subtitle="Get notified on Slack, Discord or custom endpoints" icon={<span>🔔</span>} />
        <WebhooksManager />
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white/[0.02] p-3">
      <div className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-sm">{value}</div>
    </div>
  );
}
