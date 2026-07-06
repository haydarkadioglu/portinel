"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

interface ProviderCfg {
  enabled: boolean;
  apiKey: string;
  hasKey?: boolean;
  model: string;
}
interface Config {
  active: "rule" | "openrouter" | "deepseek";
  fallback: "none" | "rule" | "openrouter" | "deepseek";
  openrouter: ProviderCfg;
  deepseek: ProviderCfg;
}

const PROVIDER_INFO: Record<string, { label: string; models: string[]; getModelsUrl: string }> = {
  openrouter: {
    label: "OpenRouter",
    models: ["deepseek/deepseek-chat", "openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5", "meta-llama/llama-3.1-70b-instruct"],
    getModelsUrl: "https://openrouter.ai/keys",
  },
  deepseek: {
    label: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    getModelsUrl: "https://platform.deepseek.com/api_keys",
  },
};

export function AiProvidersPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  useEffect(() => {
    fetch("/api/admin/ai")
      .then((r) => r.json())
      .then((d) => {
        setConfig(d.config);
      })
      .finally(() => setLoading(false));
  }, []);

  function patchProvider(id: "openrouter" | "deepseek", patch: Partial<ProviderCfg>) {
    setConfig((c) => (c ? { ...c, [id]: { ...c[id], ...patch } } : c));
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setSavedMsg("");
    const res = await fetch("/api/admin/ai", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        active: config.active,
        fallback: config.fallback,
        openrouter: {
          enabled: config.openrouter.enabled,
          apiKey: config.openrouter.apiKey || undefined,
          model: config.openrouter.model,
        },
        deepseek: {
          enabled: config.deepseek.enabled,
          apiKey: config.deepseek.apiKey || undefined,
          model: config.deepseek.model,
        },
      }),
    });
    setSaving(false);
    if (res.ok) {
      setSavedMsg("Saved ✓");
      // Clear the plaintext key field after save so it doesn't get re-submitted.
      patchProvider("openrouter", { apiKey: "" });
      patchProvider("deepseek", { apiKey: "" });
      setTimeout(() => setSavedMsg(""), 2500);
    } else {
      setSavedMsg("Save failed");
    }
  }

  async function test(id: "openrouter" | "deepseek") {
    setTesting(id);
    setTestResult((t) => ({ ...t, [id]: { ok: false, message: "Testing…" } }));
    try {
      const res = await fetch("/api/admin/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: id,
          apiKey: config?.[id].apiKey || undefined,
          model: config?.[id].model,
        }),
      });
      const data = await res.json();
      setTestResult((t) => ({ ...t, [id]: { ok: data.ok, message: data.message } }));
    } catch {
      setTestResult((t) => ({ ...t, [id]: { ok: false, message: "Network error" } }));
    }
    setTesting(null);
  }

  if (loading || !config) {
    return <div className="flex justify-center py-12 text-muted"><Spinner className="h-6 w-6" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Active / fallback selection */}
      <div className="panel p-5">
        <h3 className="mb-1 font-semibold">Routing</h3>
        <p className="mb-4 text-xs text-muted">
          The assistant tries the <strong>active</strong> provider first, then the <strong>fallback</strong>, then the built-in engine.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Active provider</label>
            <select
              value={config.active}
              onChange={(e) => setConfig({ ...config, active: e.target.value as Config["active"] })}
              className="input"
            >
              <option value="rule">Built-in engine (no API cost)</option>
              <option value="openrouter">OpenRouter</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted">Fallback (optional)</label>
            <select
              value={config.fallback}
              onChange={(e) => setConfig({ ...config, fallback: e.target.value as Config["fallback"] })}
              className="input"
            >
              <option value="none">None</option>
              <option value="rule">Built-in engine</option>
              <option value="openrouter">OpenRouter</option>
              <option value="deepseek">DeepSeek</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-line bg-black/20 p-3 text-xs text-muted">
          <span className={cn("h-2 w-2 rounded-full", config.active === "rule" ? "bg-muted" : "bg-success animate-pulse")} />
          Chain: <span className="font-mono text-brand">{config.active === "rule" ? "engine" : config.active}</span>
          {config.fallback !== "none" && <span className="text-muted">→ <span className="font-mono text-brand">{config.fallback === "rule" ? "engine" : config.fallback}</span></span>}
          <span className="text-muted">→ engine</span>
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid gap-6 lg:grid-cols-2">
        {(["openrouter", "deepseek"] as const).map((id) => {
          const info = PROVIDER_INFO[id];
          const cfg = config[id];
          return (
            <div key={id} className="panel p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", cfg.enabled ? "bg-success shadow-[0_0_8px_#34d399]" : "bg-muted")} />
                  <h3 className="font-semibold">{info.label}</h3>
                  {cfg.hasKey && <span className="badge sev-low">key set</span>}
                </div>
                <button
                  onClick={() => patchProvider(id, { enabled: !cfg.enabled })}
                  className={cn("btn !py-1 !text-xs", cfg.enabled ? "btn-ghost" : "btn-primary")}
                >
                  {cfg.enabled ? "Enabled" : "Disabled"}
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-[0.7rem] text-muted">
                    API key {cfg.hasKey && <span className="text-success">(stored — leave blank to keep)</span>}
                  </label>
                  <input
                    type="password"
                    value={cfg.apiKey}
                    onChange={(e) => patchProvider(id, { apiKey: e.target.value })}
                    placeholder={cfg.hasKey ? "••••••••••••" : `Paste ${info.label} API key…`}
                    className="input font-mono text-xs"
                  />
                  <a href={info.getModelsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[0.7rem] text-brand hover:underline">
                    Get an API key →
                  </a>
                </div>
                <div>
                  <label className="mb-1 block text-[0.7rem] text-muted">Model</label>
                  <input
                    list={`models-${id}`}
                    value={cfg.model}
                    onChange={(e) => patchProvider(id, { model: e.target.value })}
                    className="input font-mono text-xs"
                  />
                  <datalist id={`models-${id}`}>
                    {info.models.map((m) => <option key={m} value={m} />)}
                  </datalist>
                </div>

                <button
                  onClick={() => test(id)}
                  disabled={testing === id}
                  className="btn btn-ghost w-full !py-1.5 !text-xs"
                >
                  {testing === id ? <Spinner className="h-3.5 w-3.5" /> : `🔌 Test ${info.label}`}
                </button>
                {testResult[id] && (
                  <div className={cn("rounded-lg border p-2 text-[0.7rem]", testResult[id].ok ? "border-success/30 bg-success/5 text-success" : "border-danger/30 bg-danger/5 text-danger")}>
                    {testResult[id].message}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn btn-primary">
          {saving ? <Spinner className="h-4 w-4" /> : "Save configuration"}
        </button>
        {savedMsg && <span className={cn("text-sm", savedMsg.includes("✓") ? "text-success" : "text-danger")}>{savedMsg}</span>}
      </div>
    </div>
  );
}
