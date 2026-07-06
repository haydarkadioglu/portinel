import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/session";
import { getAiSettingsMasked, saveAiSettings, type ProviderId } from "@/lib/settings";
import { testProvider } from "@/lib/llm";

export const dynamic = "force-dynamic";

// Read current config (keys masked).
export async function GET() {
  await requireAdmin();
  const config = await getAiSettingsMasked();
  return NextResponse.json({ config });
}

// Save provider configuration.
export async function PUT(req: NextRequest) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body." }, { status: 400 });

  await saveAiSettings({
    active: body.active as ProviderId | undefined,
    fallback: body.fallback as ProviderId | "none" | undefined,
    openrouter: body.openrouter
      ? {
          enabled: body.openrouter.enabled,
          apiKey: body.openrouter.apiKey ?? undefined,
          model: body.openrouter.model,
        }
      : undefined,
    deepseek: body.deepseek
      ? {
          enabled: body.deepseek.enabled,
          apiKey: body.deepseek.apiKey ?? undefined,
          model: body.deepseek.model,
        }
      : undefined,
  });
  return NextResponse.json({ ok: true });
}

// Test a provider connection with a (possibly new) key.
export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const { provider } = body || {};
  if (!["openrouter", "deepseek"].includes(provider))
    return NextResponse.json({ error: "Invalid provider." }, { status: 400 });

  // Use provided key, else fall back to the stored one.
  let apiKey = body.apiKey as string | undefined;
  let model = body.model as string | undefined;
  if (!apiKey || !model) {
    const { getAiSettings } = await import("@/lib/settings");
    const cfg = await getAiSettings();
    const pcfg = provider === "openrouter" ? cfg.openrouter : cfg.deepseek;
    if (!apiKey) apiKey = pcfg.apiKey;
    if (!model) model = pcfg.model;
  }

  const result = await testProvider(provider as "openrouter" | "deepseek", apiKey || "", model || "");
  return NextResponse.json(result);
}
