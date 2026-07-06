import Link from "next/link";
import { Logo } from "@/components/ui";
import { AuthForm } from "@/components/auth-form";
import { BrandPanel } from "@/components/brand-panel";

export default function RegisterPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8"><Link href="/"><Logo /></Link></div>
          <h1 className="text-2xl font-bold">Request access</h1>
          <p className="mt-1 text-sm text-muted">
            Portinel is an invite-only platform. Accounts are created by administrators.
          </p>
          <div className="mt-6">
            <AuthForm mode="register" />
          </div>
          <div className="mt-6 rounded-lg border border-line bg-white/[0.02] p-4 text-sm text-muted">
            <p className="font-semibold text-ink">Need access?</p>
            <p className="mt-1">
              Contact your security team lead or the Portinel administrator.
              They can create your account from the Admin Panel → User Management.
            </p>
            <p className="mt-2 text-xs">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-brand">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
