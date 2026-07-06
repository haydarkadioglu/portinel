import { requireUser } from "@/lib/session";
import { CtfToolkit } from "@/components/ctf-toolkit";

export const dynamic = "force-dynamic";

export default async function ToolkitPage() {
  await requireUser();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">CTF & Crypto Toolkit</h1>
        <p className="text-sm text-muted">
          Decode, decrypt and analyse payloads — a CyberChef-style multi-tool for CTF challenges and security work.
        </p>
      </div>
      <CtfToolkit />
    </div>
  );
}
