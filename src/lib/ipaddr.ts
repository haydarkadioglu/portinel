// ============================================================================
// ipaddr — Minimal IP utility (IPv4 + IPv6): parsing, CIDR expansion, validity
// and SSRF hardening. Dependency-free so it runs on the edge runtime.
// ============================================================================

export interface Ipv4 {
  kind: "ipv4";
  octets: [number, number, number, number];
  toString(): string;
}

export interface Ipv6 {
  kind: "ipv6";
  parts: number[]; // 8 x 16-bit groups
  toString(): string;
}

// ---------------------------------------------------------------------------
// IPv4
// ---------------------------------------------------------------------------
function parseIpv4(input: string): [number, number, number, number] | null {
  const parts = input.split(".");
  if (parts.length !== 4) return null;
  const octets: [number, number, number, number] = [0, 0, 0, 0];
  for (let i = 0; i < 4; i++) {
    const n = Number(parts[i]);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    octets[i] = n as 0;
  }
  return octets;
}

function ipv4ToInt(o: [number, number, number, number]): number {
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}
function intToIpv4(n: number): [number, number, number, number] {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
}

// ---------------------------------------------------------------------------
// IPv6
// ---------------------------------------------------------------------------
// Expands a compressed IPv6 address into 8 groups. Returns null if invalid.
function parseIpv6(input: string): number[] | null {
  let addr = input.trim();
  // Handle IPv4-mapped (::ffff:1.2.3.4)
  const v4Part = addr.match(/:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4Part) {
    const octets = parseIpv4(v4Part[1]);
    if (!octets) return null;
    const hi = (octets[0] << 8) | octets[1];
    const lo = (octets[2] << 8) | octets[3];
    addr = addr.slice(0, addr.lastIndexOf(":") + 1) + hi.toString(16) + ":" + lo.toString(16);
  }
  // Handle :: compression
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  let head: string[] = [];
  let tail: string[] = [];
  if (halves.length === 2) {
    head = halves[0] ? halves[0].split(":") : [];
    tail = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null;
    const parts = [...head, ...Array(missing).fill("0"), ...tail];
    return validateGroups(parts);
  }
  return validateGroups(addr.split(":"));
}

function validateGroups(parts: string[]): number[] | null {
  if (parts.length !== 8) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(p)) return null;
    out.push(parseInt(p, 16));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function isValid(input: string): boolean {
  return parseIpv4(input) !== null || parseIpv6(input) !== null;
}

export function parse(input: string): Ipv4 | Ipv6 {
  const v4 = parseIpv4(input);
  if (v4)
    return { kind: "ipv4", octets: v4, toString: () => v4.join(".") };
  const v6 = parseIpv6(input);
  if (v6) {
    const str = v6.map((g) => g.toString(16)).join(":");
    return { kind: "ipv6", parts: v6, toString: () => str };
  }
  throw new Error(`Invalid IP address: ${input}`);
}

export function cidrToList(cidr: string, limit = 256): string[] {
  const [ipPart, prefixPart] = cidr.split("/");
  const octets = parseIpv4(ipPart.trim());
  if (!octets) throw new Error("Invalid CIDR base address");
  const prefix = Number(prefixPart);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32)
    throw new Error("Invalid CIDR prefix");

  const total = prefix >= 32 ? 1 : Math.min(2 ** (32 - prefix), limit);
  const base = ipv4ToInt(octets) & prefixMask(prefix);
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    out.push(intToIpv4((base + i) >>> 0).join("."));
  }
  return out;
}

function prefixMask(prefix: number): number {
  if (prefix === 0) return 0;
  return (0xffffffff << (32 - prefix)) >>> 0;
}

const ipaddr = { isValid, parse, cidrToList };
export default ipaddr;
