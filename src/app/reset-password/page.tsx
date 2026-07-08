"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Logo, Spinner } from "@/components/ui";
import { BrandPanel } from "@/components/brand-panel";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    setSuccess("");
    setError("");

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        setError(updateError.message);
      } else {
        setSuccess("Your password has been successfully updated.");
        // Redirect to login page after a brief delay
        setTimeout(() => {
          router.push("/login");
        }, 2000);
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <BrandPanel />
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <Link href="/">
              <Logo />
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Choose new password</h1>
          <p className="mt-1 text-sm text-muted">
            Enter your new password below.
          </p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                New password
              </label>
              <input
                id="new-password-input"
                name="password"
                type="password"
                placeholder="••••••••"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted">
                Confirm new password
              </label>
              <input
                id="confirm-password-input"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                required
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                {success}
              </div>
            )}

            <button
              id="update-submit-btn"
              type="submit"
              disabled={loading}
              className="btn btn-primary w-full"
            >
              {loading ? <Spinner className="h-4 w-4" /> : null}
              Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
