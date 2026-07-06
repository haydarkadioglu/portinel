"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { SUGGESTED_PROMPTS } from "@/lib/ai-chat";

interface Message {
  role: "user" | "assistant";
  content: string;
  ts: number;
  provider?: string;
  usedFallback?: boolean;
  toolsUsed?: { connector: string; tool: string }[];
}

// Tiny markdown-ish renderer: **bold**, • lists, code spans, line breaks.
function renderMarkdown(text: string) {
  const lines = text.split("\n");
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`|⚡|⚠️|✓|💡|🎯)/g);
    return (
      <span key={i} className="block">
        {parts.map((p, j) => {
          if (/^\*\*[^*]+\*\*$/.test(p))
            return <strong key={j} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
          if (/^`[^`]+`$/.test(p))
            return <code key={j} className="rounded bg-black/40 px-1 font-mono text-[0.8em] text-brand">{p.slice(1, -1)}</code>;
          if (/[⚡⚠️✓💡🎯]/.test(p))
            return <span key={j}>{p}</span>;
          return <span key={j}>{p}</span>;
        })}
      </span>
    );
  });
}

export function AiChat({ scanId }: { scanId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load persisted conversation memory from the database on mount.
  useEffect(() => {
    fetch(`/api/scans/${scanId}/messages`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => {
        if (d.items?.length) {
          setMessages(
            d.items.map((m: { role: string; content: string; provider?: string; toolsUsed?: unknown; ts: number }) => ({
              role: m.role === "assistant" ? "assistant" : "user",
              content: m.content,
              ts: m.ts,
              provider: m.provider || undefined,
              toolsUsed: Array.isArray(m.toolsUsed) ? m.toolsUsed : undefined,
            })),
          );
          setShowSuggestions(false);
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true));
  }, [scanId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    const userMsg: Message = { role: "user", content: question, ts: Date.now() };
    // Snapshot history BEFORE adding the new user message so the API gets the
    // prior conversation (the new question is sent separately).
    const priorMessages = messages;
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setShowSuggestions(false);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          scanId,
          question,
          history: priorMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((m) => [...m, {
          role: "assistant",
          content: data.answer,
          ts: Date.now(),
          provider: data.provider,
          usedFallback: data.usedFallback,
          toolsUsed: data.toolsUsed,
        }]);
      } else {
        setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${data.error || "Something went wrong."}`, ts: Date.now() }]);
      }
    } catch {
      setMessages((m) => [...m, { role: "assistant", content: "⚠️ Network error.", ts: Date.now() }]);
    }
    setLoading(false);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input);
  }

  return (
    <div className="flex h-[560px] flex-col">
      {/* Header */}
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-accent text-sm">
          🤖
        </div>
        <div>
          <div className="text-sm font-semibold">AI Assistant</div>
          <div className="text-[0.65rem] text-muted">Ask about findings, exploits, fixes</div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto pr-1 no-scrollbar">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            {historyLoaded ? (
              <>
                <div className="mb-3 text-3xl">🤖</div>
                <p className="max-w-xs text-sm text-muted">
                  I&apos;ve analysed this scan. Ask me anything — I can also launch sub-scans and use connected MCP tools.
                </p>
              </>
            ) : (
              <Spinner className="h-5 w-5 text-muted" />
            )}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
            {m.role === "assistant" && (
              <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand/30 to-accent/30 text-xs">🤖</div>
            )}
            <div className="max-w-[85%]">
              <div className={cn(
                "rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-br-sm bg-brand/15 text-ink"
                  : "rounded-bl-sm border border-line bg-white/[0.03] text-muted"
              )}>
                {renderMarkdown(m.content)}
              </div>
              {m.role === "assistant" && m.provider && (
                <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-1">
                  <ProviderBadge provider={m.provider} fallback={m.usedFallback} />
                  {m.toolsUsed?.map((t, j) => (
                    <span key={j} className="badge sev-info">🔧 {t.tool}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2">
            <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-brand/30 to-accent/30 text-xs">🤖</div>
            <div className="rounded-2xl rounded-bl-sm border border-line bg-white/[0.03] px-4 py-3 text-muted">
              <Spinner className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>

      {/* Suggestions */}
      {showSuggestions && messages.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTED_PROMPTS.slice(0, 4).map((s) => (
            <button key={s} onClick={() => ask(s)} className="chip !text-[0.7rem]">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this scan…"
          className="input"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary shrink-0">
          {loading ? <Spinner className="h-4 w-4" /> : "➤"}
        </button>
      </form>
    </div>
  );
}

const PROVIDER_LABELS: Record<string, { label: string; cls: string }> = {
  openrouter: { label: "OpenRouter", cls: "text-brand" },
  deepseek: { label: "DeepSeek", cls: "text-accent" },
  rule: { label: "Built-in engine", cls: "text-muted" },
};

function ProviderBadge({ provider, fallback }: { provider: string; fallback?: boolean }) {
  const p = PROVIDER_LABELS[provider] || PROVIDER_LABELS.rule;
  return (
    <span className="text-[0.6rem] text-muted">
      <span className={p.cls}>● {p.label}</span>
      {fallback && provider !== "rule" && <span className="ml-1 text-warning">(fallback)</span>}
    </span>
  );
}
