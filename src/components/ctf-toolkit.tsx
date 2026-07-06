"use client";

import { useState, type FormEvent } from "react";
import { Card, SectionTitle } from "@/components/ui";
import { cn } from "@/lib/utils";

interface Result {
  tool: string;
  ok: boolean;
  output: string;
  meta?: Record<string, string>;
  candidates?: { name: string; value: string; confidence: number }[];
}

const TOOLS = [
  { id: "auto", label: "🪄 Auto Decode", group: "decode" },
  { id: "encode-base64", label: "Base64 Encode", group: "encode" },
  { id: "encode-hex", label: "Hex Encode", group: "encode" },
  { id: "encode-url", label: "URL Encode", group: "encode" },
  { id: "encode-binary", label: "Binary Encode", group: "encode" },
  { id: "rot13", label: "ROT13", group: "cipher" },
  { id: "caesar", label: "Caesar", group: "cipher" },
  { id: "atbash", label: "Atbash", group: "cipher" },
  { id: "vigenere", label: "Vigenère", group: "cipher" },
  { id: "vigenere-decrypt", label: "Vigenère Decrypt", group: "cipher" },
  { id: "xor", label: "XOR", group: "cipher" },
  { id: "xor-hex", label: "XOR (Hex)", group: "cipher" },
  { id: "hash", label: "#️⃣ Hash", group: "crypto" },
  { id: "identify-hash", label: "Identify Hash", group: "crypto" },
  { id: "base", label: "Base Convert", group: "convert" },
  { id: "jwt", label: "🔑 JWT Decode", group: "convert" },
  { id: "analyse", label: "🔬 String Analysis", group: "convert" },
];

const GROUPS: { id: string; label: string }[] = [
  { id: "decode", label: "Decoders" },
  { id: "encode", label: "Encoders" },
  { id: "cipher", label: "Ciphers" },
  { id: "crypto", label: "Crypto" },
  { id: "convert", label: "Converters" },
];

export function CtfToolkit() {
  const [tool, setTool] = useState("auto");
  const [input, setInput] = useState("");
  const [key, setKey] = useState("");
  const [shift, setShift] = useState(3);
  const [from, setFrom] = useState(16);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  const active = TOOLS.find((t) => t.id === tool);
  const needsKey = ["vigenere", "vigenere-decrypt", "xor", "xor-hex"].includes(tool);
  const needsShift = tool === "caesar";
  const needsBase = tool === "base";

  async function run(e?: FormEvent) {
    e?.preventDefault();
    if (!input.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { tool, input };
      if (needsKey) payload.key = key;
      if (needsShift) payload.shift = shift;
      if (needsBase) payload.from = from;
      const res = await fetch("/api/ctf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setResult(data.error ? { tool, ok: false, output: data.error } : (data as Result));
    } catch {
      setResult({ tool, ok: false, output: "Network error." });
    }
    setLoading(false);
  }

  function setSample() {
    const samples: Record<string, string> = {
      auto: "ZmxhZ3tjdGZfaX9mdW59",
      "encode-base64": "password123",
      "encode-hex": "hello",
      "encode-url": "test value & more",
      "encode-binary": "AB",
      rot13: "hello world",
      caesar: "Khoor Zruog",
      atbash: "hello",
      vigenere: "attackatdawn",
      "vigenere-decrypt": "lxfopvefrnhr",
      xor: "secret",
      "xor-hex": "1b37373331363f78151b7f2b783431333d78397828372d363c78373e783a393b3736",
      hash: "admin",
      "identify-hash": "5f4dcc3b5aa765d61d8327deb882cf99",
      base: "deadbeef",
      jwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      analyse: "picoCTF{this_is_a_flag_12345}",
    };
    setInput(samples[tool] || "test input");
  }

  return (
    <div className="space-y-6">
      {/* Tool grid */}
      <div className="space-y-3">
        {GROUPS.map((g) => (
          <div key={g.id}>
            <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-wide text-muted">{g.label}</div>
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.filter((t) => t.group === g.id).map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setTool(t.id); setResult(null); }}
                  data-active={tool === t.id}
                  className="chip"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={run} className="panel space-y-3 p-5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted">Input</label>
          <button type="button" onClick={setSample} className="text-[0.7rem] text-brand hover:underline">+ sample</button>
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Paste encoded text, hash, hex, JWT…"
          rows={4}
          className="input resize-y font-mono text-xs"
        />
        {(needsKey || needsShift || needsBase) && (
          <div className="flex flex-wrap gap-3">
            {needsKey && (
              <div className="flex-1">
                <label className="mb-1 block text-[0.7rem] text-muted">Key</label>
                <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" className="input font-mono text-xs" />
              </div>
            )}
            {needsShift && (
              <div>
                <label className="mb-1 block text-[0.7rem] text-muted">Shift</label>
                <input type="number" value={shift} onChange={(e) => setShift(Number(e.target.value))} className="input w-20" />
              </div>
            )}
            {needsBase && (
              <div>
                <label className="mb-1 block text-[0.7rem] text-muted">From base</label>
                <select value={from} onChange={(e) => setFrom(Number(e.target.value))} className="input w-24">
                  <option value={2}>Binary (2)</option>
                  <option value={8}>Octal (8)</option>
                  <option value={10}>Decimal (10)</option>
                  <option value={16}>Hex (16)</option>
                </select>
              </div>
            )}
          </div>
        )}
        <button type="submit" disabled={loading || !input.trim()} className="btn btn-primary w-full">
          {loading ? "Processing…" : `▶ Run ${active?.label}`}
        </button>
      </form>

      {/* Result */}
      {result && (
        <Card>
          <SectionTitle title="Result" icon={<span>✓</span>} />
          {/* Candidates (auto-decode) */}
          {result.candidates && result.candidates.length > 0 && (
            <div className="mb-4 space-y-2">
              <div className="text-xs font-medium text-muted">Ranked candidates (by readability):</div>
              {result.candidates.map((c, i) => (
                <div key={i} className={cn("rounded-lg border p-3", i === 0 ? "border-brand/30 bg-brand/5" : "border-line bg-white/[0.02]")}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-xs font-semibold text-brand">{c.name}{i === 0 && " ★ best match"}</span>
                    <span className="text-[0.65rem] text-muted">{(c.confidence * 100).toFixed(0)}%</span>
                  </div>
                  <code className="block break-all font-mono text-xs text-ink">{c.value}</code>
                </div>
              ))}
            </div>
          )}
          {/* Direct output */}
          {!result.candidates && result.output && (
            <div className="rounded-lg border border-line bg-black/30 p-3">
              <code className="block break-all font-mono text-sm text-brand">{result.output}</code>
            </div>
          )}
          {/* Meta details */}
          {result.meta && Object.keys(result.meta).length > 0 && (
            <div className="mt-4 grid gap-1.5">
              {Object.entries(result.meta).map(([k, v]) => (
                <div key={k} className="flex gap-2 text-xs">
                  <span className="w-28 shrink-0 font-medium text-muted">{k}:</span>
                  <code className="break-all font-mono text-ink">{v}</code>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
