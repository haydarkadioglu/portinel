// ============================================================================
// vpn.ts — OpenVPN connection manager for in-LAN scanning.
//
// Lets analysts upload an OpenVPN (.ovpn) profile, establish a tunnel into a
// target network, and run scans from inside that LAN (private RFC1918 space,
// internal hosts). Configs are encrypted at rest with AES-256-GCM.
//
// The connect() flow spawns the `openvpn` binary with the decrypted config
// written to a temp file, then watches its stdout/stderr for the
// "Initialization Sequence Completed" marker. This requires:
//   • the `openvpn` binary on PATH
//   • root / CAP_NET_ADMIN (for the tun device)
// In sandboxed/ephemeral runtimes these may be absent; the manager detects
// that and reports a clear status so the UI can show what's available.
// ============================================================================
import { spawn, type ChildProcess } from "child_process";
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { db } from "@/db";
import { vpnConfigs } from "@/db/schema";
import { eq } from "drizzle-orm";

const AUTH_SECRET = process.env.AUTH_SECRET || "portinel-dev-secret";

// Derive a 32-byte key from the auth secret (scrypt).
const KEY = scryptSync(AUTH_SECRET, "portinel-vpn-salt", 32);

// ---------------------------------------------------------------------------
// Encryption helpers (AES-256-GCM)
// ---------------------------------------------------------------------------
export function encryptConfig(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptConfig(blob: string): string {
  const buf = Buffer.from(blob, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

// ---------------------------------------------------------------------------
// .ovpn parsing — extract the remote endpoint for display.
// ---------------------------------------------------------------------------
export interface ParsedOvpn {
  remoteHost?: string;
  remotePort?: number;
  remoteProto?: string;
  protocol?: string;
  auth?: string;
  caCount: number;
  certCount: number;
  keyCount: number;
}

export function parseOvpn(content: string): ParsedOvpn {
  const out: ParsedOvpn = { caCount: 0, certCount: 0, keyCount: 0 };
  const lines = content.split("\n");
  for (let raw of lines) {
    const line = raw.trim();
    if (line.startsWith("#") || line.startsWith(";")) continue;
    if (line.toLowerCase().startsWith("remote ")) {
      const parts = line.split(/\s+/).slice(1);
      out.remoteHost = parts[0];
      if (parts[1]) out.remotePort = parseInt(parts[1], 10);
      if (parts[2]) out.remoteProto = parts[2];
    }
    if (/^proto\s+/i.test(line)) out.protocol = line.split(/\s+/)[1];
    if (/^auth-user-pass/i.test(line)) out.auth = "user-pass";
    if (line.includes("<ca>")) out.caCount++;
    if (line.includes("<cert>")) out.certCount++;
    if (line.includes("<key>")) out.keyCount++;
  }
  return out;
}

export function validateOvpn(content: string): { ok: boolean; error?: string } {
  if (!content || content.length < 20)
    return { ok: false, error: "File appears empty or too small." };
  const lower = content.toLowerCase();
  if (!lower.includes("remote") && !lower.includes("client"))
    return { ok: false, error: "Not a valid OpenVPN config (no 'remote' or 'client' directive)." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// OpenVPN binary + capability detection
// ---------------------------------------------------------------------------
let binaryCache: boolean | null = null;
export async function isOpenVpnAvailable(): Promise<boolean> {
  if (binaryCache !== null) return binaryCache;
  return new Promise((resolve) => {
    try {
      const proc = spawn("which", ["openvpn"], { stdio: "ignore" });
      proc.on("error", () => { binaryCache = false; resolve(false); });
      proc.on("close", (code) => { binaryCache = code === 0; resolve(binaryCache); });
    } catch {
      binaryCache = false;
      resolve(false);
    }
  });
}

// ---------------------------------------------------------------------------
// Connection registry (in-memory; one active tunnel per process model)
// ---------------------------------------------------------------------------
interface ActiveTunnel {
  vpnId: string;
  proc: ChildProcess;
  tempDir: string;
  tunnelIp?: string;
  connectedAt: number;
}
const tunnels = new Map<string, ActiveTunnel>();

export interface ConnectResult {
  ok: boolean;
  status: "connected" | "connecting" | "error";
  tunnelIp?: string;
  message: string;
}

export async function connectVpn(vpnId: string): Promise<ConnectResult> {
  // Already connected?
  if (tunnels.has(vpnId)) {
    const t = tunnels.get(vpnId)!;
    return { ok: true, status: "connected", tunnelIp: t.tunnelIp, message: "Already connected." };
  }

  const available = await isOpenVpnAvailable();
  if (!available) {
    // Mark as "connecting" conceptually but inform the binary is missing.
    await db.update(vpnConfigs).set({ connectionStatus: "error" }).where(eq(vpnConfigs.id, vpnId));
    return {
      ok: false,
      status: "error",
      message:
        "The OpenVPN binary is not installed in this runtime. In a production deployment with the openvpn package and CAP_NET_ADMIN, this establishes a real tunnel into the target LAN.",
    };
  }

  const [row] = await db.select().from(vpnConfigs).where(eq(vpnConfigs.id, vpnId)).limit(1);
  if (!row) return { ok: false, status: "error", message: "VPN config not found." };

  const config = decryptConfig(row.encryptedConfig);
  const tempDir = mkdtempSync(join(tmpdir(), "portinel-vpn-"));
  const configPath = join(tempDir, "client.ovpn");
  writeFileSync(configPath, config, { mode: 0o600 });

  await db.update(vpnConfigs).set({ connectionStatus: "connecting" }).where(eq(vpnConfigs.id, vpnId));

  return new Promise((resolve) => {
    let settled = false;
    const finish = (r: ConnectResult) => {
      if (settled) return;
      settled = true;
      resolve(r);
    };

    const proc = spawn("openvpn", ["--config", configPath, "--verb", "3"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let log = "";
    proc.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      log += text;
      // Successful connection marker.
      if (text.includes("Initialization Sequence Completed")) {
        const ipMatch = log.match(/(Peer Connection Initiated with|[A-Za-z0-9]+ (\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}))[\s\S]*?([0-9.]+)\/\d+/);
        const ip = ipMatch?.[3];
        tunnels.set(vpnId, { vpnId, proc, tempDir, tunnelIp: ip, connectedAt: Date.now() });
        db.update(vpnConfigs)
          .set({ connectionStatus: "connected", tunnelIp: ip, lastConnectedAt: new Date() })
          .where(eq(vpnConfigs.id, vpnId))
          .catch(() => {});
        finish({ ok: true, status: "connected", tunnelIp: ip, message: "Tunnel established." });
      }
      // Auth/connection failures.
      if (/AUTH_FAILED|private key password|Cannot resolve|Connection refused|exiting/i.test(text)) {
        finish({ ok: false, status: "error", message: `OpenVPN failed: ${text.split("\n").pop()?.trim() || "connection error"}` });
        proc.kill();
        cleanupTemp(tempDir);
        tunnels.delete(vpnId);
        db.update(vpnConfigs).set({ connectionStatus: "error" }).where(eq(vpnConfigs.id, vpnId)).catch(() => {});
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => { log += chunk.toString(); });
    proc.on("error", () => {
      finish({ ok: false, status: "error", message: "Failed to start the OpenVPN process." });
    });
    proc.on("close", () => {
      if (!settled) finish({ ok: false, status: "error", message: "OpenVPN process exited before connecting." });
    });

    // Resolve as "connecting" after 6s if not yet done (tunnel may take longer).
    setTimeout(() => {
      if (!settled) {
        tunnels.set(vpnId, { vpnId, proc, tempDir, connectedAt: Date.now() });
        finish({ ok: true, status: "connecting", message: "Tunnel is negotiating — check status shortly." });
      }
    }, 6000);
  });
}

export async function disconnectVpn(vpnId: string): Promise<void> {
  const t = tunnels.get(vpnId);
  if (t) {
    try { t.proc.kill("SIGTERM"); } catch { /* ignore */ }
    cleanupTemp(t.tempDir);
    tunnels.delete(vpnId);
  }
  await db.update(vpnConfigs).set({ connectionStatus: "disconnected", tunnelIp: null }).where(eq(vpnConfigs.id, vpnId));
}

export function getTunnelStatus(vpnId: string): { connected: boolean; uptimeMs?: number; tunnelIp?: string } {
  const t = tunnels.get(vpnId);
  if (!t) return { connected: false };
  return { connected: true, uptimeMs: Date.now() - t.connectedAt, tunnelIp: t.tunnelIp };
}

export function isVpnConnected(vpnId: string): boolean {
  return tunnels.has(vpnId);
}

function cleanupTemp(dir: string) {
  try {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

export function maskConfig(content: string): string {
  // Return a redacted preview (hide inline certs/keys) for safe display.
  return content
    .replace(/<ca>[\s\S]*?<\/ca>/gi, "<ca>…redacted…</ca>")
    .replace(/<cert>[\s\S]*?<\/cert>/gi, "<cert>…redacted…</cert>")
    .replace(/<key>[\s\S]*?<\/key>/gi, "<key>…redacted…</key>")
    .replace(/(auth-user-pass[^\n]*)/gi, "$1")
    .split("\n")
    .filter((l) => !/^(#|;)/.test(l.trim()))
    .slice(0, 30)
    .join("\n");
}
