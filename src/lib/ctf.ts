// ============================================================================
// ctf.ts — CTF (Capture The Flag) solving toolkit.
//
// A CyberChef-style multi-tool for decoding, decrypting and analysing payloads
// common in CTF challenges and security work. Pure functions, no network —
// deterministic and fast.
// ============================================================================

export interface ToolResult {
  tool: string;
  ok: boolean;
  output: string;
  meta?: Record<string, string>;
  candidates?: { name: string; value: string; confidence: number }[];
}

// ---------------------------------------------------------------------------
// Auto-decode: try every decoder and rank candidates by "looks like text".
// ---------------------------------------------------------------------------
const PRINTABLE_RE = /^[\x20-\x7E\r\n\t]+$/;
const FLAG_RE = /(flag|ctf|picoctf|htb|thm)\{[^}]+\}/i;

function scoreText(s: string): number {
  if (!s) return 0;
  if (!PRINTABLE_RE.test(s)) return 0;
  let score = Math.min(s.length, 100) / 100;
  const letters = (s.match(/[a-zA-Z ]/g) || []).length;
  score += (letters / s.length) * 1.5;
  if (FLAG_RE.test(s)) score += 5; // looks like a flag!
  if (/\b(the|is|to|and|of|in|for|password|secret|admin|user|key)\b/i.test(s)) score += 0.8;
  return score;
}

export function autoDecode(input: string): ToolResult {
  const trimmed = input.trim();
  const candidates: { name: string; value: string; confidence: number }[] = [];

  const tryAdd = (name: string, value: string | null) => {
    if (value !== null && value.length > 0) {
      candidates.push({ name, value, confidence: scoreText(value) });
    }
  };

  tryAdd("Base64", fromBase64(trimmed));
  tryAdd("Base64 (URL-safe)", fromBase64(trimmed.replace(/-/g, "+").replace(/_/g, "/")));
  tryAdd("Base32", fromBase32(trimmed));
  tryAdd("Hex", fromHex(trimmed));
  tryAdd("URL-encoded", fromUrl(trimmed));
  tryAdd("Binary", fromBinary(trimmed));
  tryAdd("Octal", fromOctal(trimmed));
  tryAdd("ROT13", rot13(trimmed));
  tryAdd("Reverse", trimmed.split("").reverse().join(""));

  // Caesar best-shift
  const caesar = bestCaesar(trimmed);
  if (caesar) tryAdd(`Caesar (shift ${caesar.shift})`, caesar.text);

  // Hex -> base64 chain
  const hexDecoded = fromHex(trimmed);
  if (hexDecoded) tryAdd("Hex→Base64", fromBase64(hexDecoded));

  candidates.sort((a, b) => b.confidence - a.confidence);

  return {
    tool: "auto",
    ok: candidates.length > 0,
    output: candidates[0]?.value || "No decodings produced readable text.",
    candidates: candidates.slice(0, 8),
  };
}

// ---------------------------------------------------------------------------
// Base64
// ---------------------------------------------------------------------------
export function fromBase64(input: string): string | null {
  try {
    const cleaned = input.replace(/\s/g, "");
    if (!/^[A-Za-z0-9+/=_-]+$/.test(cleaned) || cleaned.length < 4) return null;
    return Buffer.from(cleaned, "base64").toString("utf8");
  } catch {
    return null;
  }
}
export function toBase64(input: string): string {
  return Buffer.from(input, "utf8").toString("base64");
}

// ---------------------------------------------------------------------------
// Base32
// ---------------------------------------------------------------------------
export function fromBase32(input: string): string | null {
  try {
    const cleaned = input.toUpperCase().replace(/\s/g, "").replace(/=+$/, "");
    if (!/^[A-Z2-7]+$/.test(cleaned) || cleaned.length < 8) return null;
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = "";
    for (const c of cleaned) {
      const idx = alphabet.indexOf(c);
      if (idx === -1) return null;
      bits += idx.toString(2).padStart(5, "0");
    }
    let out = "";
    for (let i = 0; i + 8 <= bits.length; i += 8) {
      out += String.fromCharCode(parseInt(bits.slice(i, i + 8), 2));
    }
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hex
// ---------------------------------------------------------------------------
export function fromHex(input: string): string | null {
  try {
    const cleaned = input.replace(/0x|\s|[:,]/gi, "");
    if (!/^[0-9a-fA-F]+$/.test(cleaned) || cleaned.length % 2 !== 0) return null;
    return Buffer.from(cleaned, "hex").toString("utf8");
  } catch {
    return null;
  }
}
export function toHex(input: string): string {
  return Buffer.from(input, "utf8").toString("hex");
}

// ---------------------------------------------------------------------------
// URL encoding
// ---------------------------------------------------------------------------
export function fromUrl(input: string): string | null {
  try {
    if (!input.includes("%")) return null;
    return decodeURIComponent(input);
  } catch {
    return null;
  }
}
export function toUrl(input: string): string {
  return encodeURIComponent(input);
}

// ---------------------------------------------------------------------------
// Binary / Octal
// ---------------------------------------------------------------------------
export function fromBinary(input: string): string | null {
  const cleaned = input.replace(/\s/g, "");
  if (!/^[01]+$/.test(cleaned) || cleaned.length % 8 !== 0) return null;
  let out = "";
  for (let i = 0; i < cleaned.length; i += 8) {
    out += String.fromCharCode(parseInt(cleaned.slice(i, i + 8), 2));
  }
  return out;
}
export function toBinary(input: string): string {
  return input
    .split("")
    .map((c) => c.charCodeAt(0).toString(2).padStart(8, "0"))
    .join(" ");
}
export function fromOctal(input: string): string | null {
  const parts = input.trim().split(/[\s,]+/);
  if (!parts.every((p) => /^[0-7]+$/.test(p))) return null;
  try {
    return parts.map((p) => String.fromCharCode(parseInt(p, 8))).join("");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Ciphers: Caesar, ROT13, Atbash, Vigenère, XOR
// ---------------------------------------------------------------------------
export function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
  });
}

export function caesar(input: string, shift: number): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(((c.charCodeAt(0) - base + shift + 26) % 26) + base);
  });
}

export function bestCaesar(input: string): { text: string; shift: number } | null {
  if (!/[a-zA-Z]/.test(input)) return null;
  let best = { text: "", shift: 0, score: 0 };
  for (let s = 1; s < 26; s++) {
    const text = caesar(input, s);
    const sc = scoreText(text);
    if (sc > best.score) best = { text, shift: s, score: sc };
  }
  return best.score > 0.5 ? best : null;
}

export function atbash(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    return String.fromCharCode(base + 25 - (c.charCodeAt(0) - base));
  });
}

export function vigenere(input: string, key: string, decrypt = false): string {
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  if (!k) return input;
  let ki = 0;
  return input.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= "Z" ? 65 : 97;
    const shift = k.charCodeAt(ki % k.length) - 97;
    ki++;
    const eff = decrypt ? -shift : shift;
    return String.fromCharCode(((c.charCodeAt(0) - base + eff + 26) % 26) + base);
  });
}

export function xor(input: string, key: string): string {
  if (!key) return input;
  const out: string[] = [];
  for (let i = 0; i < input.length; i++) {
    out.push(String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length)));
  }
  return out.join("");
}

export function xorHex(hexInput: string, key: string): string {
  const bytes = Buffer.from(hexInput.replace(/\s/g, ""), "hex");
  if (!bytes.length) return "";
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ key.charCodeAt(i % key.length);
  }
  return out.toString("utf8");
}

// ---------------------------------------------------------------------------
// Hashing + identification
// ---------------------------------------------------------------------------
import { createHash } from "crypto";

export function hashAll(input: string): ToolResult {
  const meta: Record<string, string> = {
    MD5: createHash("md5").update(input).digest("hex"),
    SHA1: createHash("sha1").update(input).digest("hex"),
    SHA256: createHash("sha256").update(input).digest("hex"),
    SHA512: createHash("sha512").update(input).digest("hex"),
    SHA3_256: createHash("sha3-256").update(input).digest("hex"),
  };
  return { tool: "hash", ok: true, output: meta.SHA256, meta };
}

export function identifyHash(hash: string): ToolResult {
  const h = hash.trim().replace(/[:\s-]/g, "");
  const types: { re: RegExp; name: string }[] = [
    { re: /^[a-f0-9]{32}$/, name: "MD5 / NTLM / MD4" },
    { re: /^[a-f0-9]{40}$/, name: "SHA-1" },
    { re: /^[a-f0-9]{56}$/, name: "SHA-224" },
    { re: /^[a-f0-9]{64}$/, name: "SHA-256" },
    { re: /^[a-f0-9]{96}$/, name: "SHA-384" },
    { re: /^[a-f0-9]{128}$/, name: "SHA-512" },
    { re: /^\$2[abxy]\$/, name: "bcrypt" },
    { re: /^\$1\$/, name: "MD5 Crypt (Unix)" },
    { re: /^\$5\$/, name: "SHA-256 Crypt (Unix)" },
    { re: /^\$6\$/, name: "SHA-512 Crypt (Unix)" },
    { re: /^[a-f0-9]{16}$/, name: "MySQL 3.x / Oracle" },
    { re: /^\*[A-F0-9]{40}$/, name: "MySQL 4.1+ / SHA-1" },
  ];
  for (const t of types) {
    if (t.re.test(h)) {
      return {
        tool: "identify-hash",
        ok: true,
        output: t.name,
        meta: { length: String(h.length), hash: h },
      };
    }
  }
  return {
    tool: "identify-hash",
    ok: false,
    output: "Unknown hash format.",
    meta: { length: String(h.length) },
  };
}

// ---------------------------------------------------------------------------
// Number base converter
// ---------------------------------------------------------------------------
export function convertBase(input: string, from: number): ToolResult {
  const cleaned = input.trim().replace(/\s/g, "");
  let dec: number | null = null;
  try {
    if (from === 2 && /^[01]+$/.test(cleaned)) dec = parseInt(cleaned, 2);
    else if (from === 8 && /^[0-7]+$/.test(cleaned)) dec = parseInt(cleaned, 8);
    else if (from === 10 && /^\d+$/.test(cleaned)) dec = parseInt(cleaned, 10);
    else if (from === 16 && /^[0-9a-f]+$/i.test(cleaned)) dec = parseInt(cleaned, 16);
  } catch {
    /* ignore */
  }
  if (dec === null || Number.isNaN(dec))
    return { tool: "base", ok: false, output: "Invalid number for the selected base." };
  if (dec > Number.MAX_SAFE_INTEGER)
    return {
      tool: "base",
      ok: true,
      output: dec.toString(10),
      meta: { decimal: dec.toString(10), note: "value exceeds safe integer" },
    };
  return {
    tool: "base",
    ok: true,
    output: dec.toString(10),
    meta: {
      binary: dec.toString(2),
      octal: dec.toString(8),
      decimal: dec.toString(10),
      hex: dec.toString(16).toUpperCase(),
      char: dec >= 32 && dec <= 126 ? String.fromCharCode(dec) : "",
    },
  };
}

// ---------------------------------------------------------------------------
// JWT decoder
// ---------------------------------------------------------------------------
export function decodeJwt(token: string): ToolResult {
  const parts = token.trim().split(".");
  if (parts.length !== 3)
    return { tool: "jwt", ok: false, output: "Not a valid JWT (expected 3 dot-separated parts)." };
  const decode = (p: string): unknown => {
    try {
      return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    } catch {
      return null;
    }
  };
  const header = decode(parts[0]);
  const payload = decode(parts[1]);
  if (!header && !payload)
    return { tool: "jwt", ok: false, output: "Could not decode header/payload." };
  const meta: Record<string, string> = {};
  if (header) meta.header = JSON.stringify(header, null, 2);
  if (payload) {
    const p = payload as Record<string, unknown>;
    meta.payload = JSON.stringify(payload, null, 2);
    if (p.exp) {
      const exp = (p.exp as number) * 1000;
      meta.expires = new Date(exp).toISOString();
      meta.expired = exp < Date.now() ? "YES" : "no";
    }
    if (p.iat) meta.issuedAt = new Date((p.iat as number) * 1000).toISOString();
    if (p.alg === "none") meta.warning = "alg: none — token is unsigned!";
  }
  meta.signature = parts[2].slice(0, 24) + "…";
  return { tool: "jwt", ok: true, output: meta.payload || meta.header, meta };
}

// ---------------------------------------------------------------------------
// String analysis
// ---------------------------------------------------------------------------
export function analyseString(input: string): ToolResult {
  const len = input.length;
  const bytes = Buffer.byteLength(input, "utf8");
  const freq: Record<string, number> = {};
  for (const c of input) freq[c] = (freq[c] || 0) + 1;
  const top = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([c, n]) => `${c === " " ? "␠" : c === "\n" ? "⏎" : c}:${n}`)
    .join("  ");
  // Shannon entropy
  let entropy = 0;
  for (const c in freq) {
    const p = freq[c] / len;
    entropy -= p * Math.log2(p);
  }
  const reversed = input.split("").reverse().join("");
  const flagMatch = input.match(FLAG_RE);
  return {
    tool: "analyse",
    ok: true,
    output: reversed,
    meta: {
      length: String(len),
      bytes: String(bytes),
      uniqueChars: String(Object.keys(freq).length),
      entropy: entropy.toFixed(3),
      topChars: top,
      flag: flagMatch ? flagMatch[0] : "",
      reversed,
    },
  };
}
