"use client";

import { useState } from "react";

export function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/r/${token}` : `/r/${token}`;
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="btn btn-ghost !py-1.5 !text-xs"
    >
      {copied ? "✓ Copied" : "🔗 Share"}
    </button>
  );
}
