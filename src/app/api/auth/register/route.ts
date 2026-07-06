import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Self-registration is DISABLED. Only admins can create accounts.
// Users who need access must contact an administrator.
export async function POST() {
  return NextResponse.json(
    {
      error:
        "Self-registration is disabled. Contact an administrator to request access.",
    },
    { status: 403 },
  );
}
