// ============================================================================
// settings.ts — Platform settings store + AI provider configuration.
//
// Stores the active/fallback AI provider and their (encrypted) API keys +
// model selections in the `settings` table. The admin panel writes here.
// ============================================================================
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { encrypt, decrypt } from "./secret";

export type ProviderId = "rule" | "openrouter" | "deepseek";

export interface ProviderConfig {
  enabled: boolean;
  apiKey: string; // encrypted at rest
  model: string;
}

export interface AiSettings {
  active: ProviderId;
  fallback: ProviderId | "none";
  openrouter: ProviderConfig;
  deepseek: ProviderConfig;
}

const KEY = "ai_providers";

export const DEFAULT_MODELS: Record<Exclude<ProviderId, "rule">, string> = {
  openrouter: "deepseek/deepseek-chat",
  deepseek: "deepseek-chat",
};

const DEFAULTS: AiSettings = {
  active: "rule",
  fallback: "none",
  openrouter: { enabled: false, apiKey: "", model: DEFAULT_MODELS.openrouter },
  deepseek: { enabled: false, apiKey: "", model: DEFAULT_MODELS.deepseek },
};

/** Read AI settings, decrypting keys for server-side use. */
export async function getAiSettings(): Promise<AiSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
  if (!row) return { ...DEFAULTS };
  const v = row.value as Partial<AiSettings>;
  return {
    active: (v.active as ProviderId) || "rule",
    fallback: (v.fallback as ProviderId | "none") ?? "none",
    openrouter: {
      enabled: !!v.openrouter?.enabled,
      apiKey: v.openrouter?.apiKey ? decrypt(v.openrouter.apiKey) : "",
      model: v.openrouter?.model || DEFAULT_MODELS.openrouter,
    },
    deepseek: {
      enabled: !!v.deepseek?.enabled,
      apiKey: v.deepseek?.apiKey ? decrypt(v.deepseek.apiKey) : "",
      model: v.deepseek?.model || DEFAULT_MODELS.deepseek,
    },
  };
}

/** Read AI settings with keys MASKED (safe to send to the admin UI). */
export async function getAiSettingsMasked(): Promise<AiSettings & { openrouter: { hasKey: boolean }; deepseek: { hasKey: boolean } }> {
  const s = await getAiSettings();
  return {
    active: s.active,
    fallback: s.fallback,
    openrouter: {
      enabled: s.openrouter.enabled,
      apiKey: "",
      hasKey: !!s.openrouter.apiKey,
      model: s.openrouter.model,
    },
    deepseek: {
      enabled: s.deepseek.enabled,
      apiKey: "",
      hasKey: !!s.deepseek.apiKey,
      model: s.deepseek.model,
    },
  } as AiSettings & { openrouter: { hasKey: boolean }; deepseek: { hasKey: boolean } };
}

/** Persist AI settings, encrypting any newly-provided API keys. */
export async function saveAiSettings(input: {
  active?: ProviderId;
  fallback?: ProviderId | "none";
  openrouter?: Partial<ProviderConfig> & { hasKey?: boolean };
  deepseek?: Partial<ProviderConfig> & { hasKey?: boolean };
}): Promise<void> {
  const current = await getAiSettings();

  const merge = (prev: ProviderConfig, next?: Partial<ProviderConfig> & { hasKey?: boolean }): ProviderConfig => {
    if (!next) return prev;
    // Only re-encrypt if a new plaintext key is provided (non-empty apiKey).
    let apiKey = prev.apiKey;
    if (next.apiKey !== undefined) {
      apiKey = next.apiKey; // new plaintext from admin form
    }
    return {
      enabled: next.enabled ?? prev.enabled,
      apiKey,
      model: next.model ?? prev.model,
    };
  };

  const next: AiSettings = {
    active: input.active ?? current.active,
    fallback: input.fallback ?? current.fallback,
    openrouter: merge(current.openrouter, input.openrouter),
    deepseek: merge(current.deepseek, input.deepseek),
  };

  // Encrypt keys before storing.
  const stored = {
    active: next.active,
    fallback: next.fallback,
    openrouter: {
      enabled: next.openrouter.enabled,
      apiKey: next.openrouter.apiKey ? encrypt(next.openrouter.apiKey) : "",
      model: next.openrouter.model,
    },
    deepseek: {
      enabled: next.deepseek.enabled,
      apiKey: next.deepseek.apiKey ? encrypt(next.deepseek.apiKey) : "",
      model: next.deepseek.model,
    },
  };

  await db
    .insert(settings)
    .values({ key: KEY, value: stored })
    .onConflictDoUpdate({ target: settings.key, set: { value: stored, updatedAt: new Date() } });
}
