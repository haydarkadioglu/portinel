// ============================================================================
// validation.ts — Target & port parsing / validation with SSRF hardening.
// ============================================================================
import { z } from "zod";
import ipaddr from "./ipaddr";
import type { ScanType } from "./types";

export interface ParsedTarget {
  type: "ip" | "domain" | "hostname" | "cidr";
  value: string;
  host: string; // first connectable host
  cidrIps?: string[];
}

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const CIDR_RE = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const HOST_RE =
  /^([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export function classifyTarget(raw: string): ParsedTarget["type"] | null {
  const v = raw.trim().toLowerCase();
  if (CIDR_RE.test(v)) {
    const bits = parseInt(v.split("/")[1], 10);
    if (bits >= 0 && bits <= 32) return "cidr";
    return null;
  }
  if (IPV4_RE.test(v) && v.split(".").every((p) => +p <= 255)) return "ip";
  if (HOST_RE.test(v)) {
    // Distinguish apex/sub domain vs hostname — functionally the same for us.
    return "domain";
  }
  // single-label internal hostname
  if (/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,62}$/.test(v)) return "hostname";
  return null;
}

// Cloud metadata / link-local / loopback are blocked to prevent SSRF against
// the hosting infrastructure. Private ranges are permitted (internal pentests).
export function isSsrfBlocked(ip: string): boolean {
  const ipStr = ipaddr.isValid(ip) ? ip : "";
  if (!ipStr) return false;
  const addr = ipaddr.parse(ipStr);
  if (addr.kind === "ipv4") {
    const [o0, o1] = addr.octets;
    if (o0 === 169 && o1 === 254) return true; // link-local / cloud metadata
    if (o0 === 127) return true; // loopback
    if (o0 === 0 && o1 === 0 && addr.octets[2] === 0 && addr.octets[3] === 0)
      return true; // 0.0.0.0
  } else if (addr.kind === "ipv6") {
    const [g0] = addr.parts;
    if (ipStr === "::1") return true; // IPv6 loopback
    if (g0 === 0xfe80 || g0 === 0xfe90 || g0 === 0xfea0 || g0 === 0xfeb0)
      return true; // fe80::/10 link-local
    if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if (g0 === 0x64 && addr.parts[1] === 0xff9b) return true; // 64:ff9b:: NAT64
  }
  return false;
}

export function expandCidr(cidr: string, limit = 256): string[] {
  try {
    return ipaddr.cidrToList(cidr, limit);
  } catch {
    return [];
  }
}

export function parseTarget(raw: string): {
  ok: boolean;
  target?: ParsedTarget;
  error?: string;
} {
  let value = raw.trim();
  if (!value) return { ok: false, error: "Target is required." };

  // 1. Strip protocol if present
  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      value = url.hostname;
    } catch {
      value = value.replace(/^https?:\/\//i, "");
    }
  }

  // 2. Strip trailing slash and any paths (e.g., "example.com/path" -> "example.com")
  value = value.split("/")[0];

  // 3. Strip port numbers if present (e.g., "example.com:8080" -> "example.com")
  if (value.includes(":") && (value.match(/:/g) || []).length === 1) {
    value = value.split(":")[0];
  }

  if (value.length > 253)
    return { ok: false, error: "Target is too long." };

  const type = classifyTarget(value);
  if (!type)
    return {
      ok: false,
      error: "Enter a valid IP address, domain, hostname, or CIDR range.",
    };

  if (type === "cidr") {
    const ips = expandCidr(value);
    if (ips.length === 0)
      return { ok: false, error: "Invalid CIDR range." };
    const blocked = ips.find(isSsrfBlocked);
    if (blocked)
      return {
        ok: false,
        error: "Range includes a blocked (metadata/loopback) address.",
      };
    return { ok: true, target: { type, value, host: ips[0], cidrIps: ips } };
  }
  if (type === "ip") {
    if (isSsrfBlocked(value))
      return {
        ok: false,
        error: "Blocked target (metadata/loopback address).",
      };
    return { ok: true, target: { type, value, host: value } };
  }
  // domain / hostname
  return { ok: true, target: { type, value, host: value } };
}

// ---------------------------------------------------------------------------
// Port parsing: "80,443", "1-1000", "80,1000-2000"
// ---------------------------------------------------------------------------
export function parsePorts(input: string, max = 65535): number[] {
  const set = new Set<number>();
  for (const part of input.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const range = trimmed.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const start = Math.max(1, parseInt(range[1], 10));
      const end = Math.min(65535, parseInt(range[2], 10));
      for (let p = start; p <= end && set.size < max; p++) set.add(p);
    } else if (/^\d+$/.test(trimmed)) {
      const p = parseInt(trimmed, 10);
      if (p >= 1 && p <= 65535 && set.size < max) set.add(p);
    }
  }
  return [...set].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Scan request schema
// ---------------------------------------------------------------------------
export const scanRequestSchema = z.object({
  target: z.string().min(1).max(253),
  scanTypes: z.array(z.string()).min(1),
  ports: z.string().optional(),
  intensity: z.enum(["light", "normal", "aggressive"]).optional().default("normal"),
});

export type ScanRequestBody = z.infer<typeof scanRequestSchema>;

export const SCAN_TYPE_OPTIONS: {
  id: string;
  label: string;
  description: string;
  icon: string;
}[] = [
  { id: "quick", label: "Quick Scan", description: "Top 20 ports + HTTP, DNS, SSL", icon: "⚡" },
  { id: "deep", label: "Deep Scan", description: "Everything — ports, SSL, DNS, WHOIS, subdomains", icon: "🔬" },
  { id: "stealth", label: "Stealth Scan", description: "Slow, low-concurrency port probing", icon: "🥷" },
  { id: "service", label: "Service Detection", description: "Banner grabbing & versioning", icon: "🧩" },
  { id: "os", label: "OS Detection", description: "Heuristic host fingerprinting", icon: "🖥️" },
  { id: "ssl", label: "SSL Analysis", description: "Certificates, ciphers, TLS versions", icon: "🔒" },
  { id: "dns", label: "DNS Analysis", description: "Full DNS record enumeration", icon: "🌐" },
  { id: "whois", label: "WHOIS", description: "Registration via RDAP", icon: "📇" },
  { id: "rdns", label: "Reverse DNS", description: "PTR record lookups", icon: "🔄" },
  { id: "http", label: "HTTP Analysis", description: "Headers, redirects, cookies", icon: "📡" },
  { id: "tech", label: "Technology Detection", description: "Stack & CMS fingerprinting", icon: "🧠" },
  { id: "subdomains", label: "Subdomain Enumeration", description: "CT logs + DNS brute-force discovery", icon: "🕸️" },
  { id: "headers", label: "Header Analysis", description: "Security header auditing", icon: "📋" },
  { id: "waf", label: "WAF Detection", description: "Cloudflare, AWS WAF, Akamai & more", icon: "🛡️" },
  { id: "dirs", label: "Directory Discovery", description: "Brute-force paths, admin panels, backups", icon: "📁" },
  { id: "web", label: "Web Recon", description: "robots.txt, sitemap, security.txt, CORS", icon: "🌐" },
  { id: "cors", label: "CORS Audit", description: "Cross-origin & HTTP method analysis", icon: "🔌" },
];

const DEFAULT_SCAN_TYPES: ScanType[] = ["quick"];

export function coerceScanTypes(input: string[]): ScanType[] {
  const valid = new Set(SCAN_TYPE_OPTIONS.map((o) => o.id));
  const out = input.filter((t) => valid.has(t)) as ScanType[];
  return out.length ? out : DEFAULT_SCAN_TYPES;
}
