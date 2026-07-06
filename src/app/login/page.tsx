import Link from "next/link";
import { Logo } from "@/components/ui";
import { AuthForm } from "@/components/auth-form";
import { BrandPanel } from "@/components/brand-panel";

export default function LoginPage() {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8"><Link href="/"><Logo /></Link></div>
          <h1 className="text-2xl font-bold">Welcome back</h1>
          <p className="mt-1 text-sm text-muted">Sign in to your reconnaissance console.</p>
          <div className="mt-6"><AuthForm mode="login" /></div>
        </div>
      </div>
    </div>
  );
}
