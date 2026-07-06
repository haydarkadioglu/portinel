// ============================================================================
// secret.ts — AES-256-GCM encryption for secrets stored at rest (API keys…)
// ============================================================================
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const AUTH_SECRET =
  process.env.AUTH_SECRET || "portinel-dev-secret-change-in-production";
const KEY = scryptSync(AUTH_SECRET, "portinel-secret-salt", 32);

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(blob: string): string {
  try {
    const buf = Buffer.from(blob, "base64");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskKey(key: string): string {
  if (!key || key.length < 10) return key ? "••••" : "";
  return key.slice(0, 6) + "••••" + key.slice(-4);
}
