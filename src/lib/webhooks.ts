// ============================================================================
// webhooks.ts — Deliver scan-completion events to external endpoints.
//
// Formats payloads for generic JSON endpoints AND auto-adapts the shape for
// Slack/Discord incoming webhooks. Fired (best-effort) after a scan finishes.
// ============================================================================
import { db } from "@/db";
import { webhooks } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import type { ScanRecord } from "./types";

const UA = "Portinel-Webhook/1.0";
const isSlack = (url: string) => /hooks\.slack\.com/i.test(url);
const isDiscord = (url: string) => /discord(?:app)?\.com\/api\/webhooks/i.test(url);

function buildPayload(scan: ScanRecord, url: string) {
  const risk = scan.riskScore ?? "—";
  const grade = scan.grade ?? "—";
  const summary = scan.results?.ai?.executiveSummary?.slice(0, 280) ?? "";
  const emoji = scan.status === "completed" ? "🛰️" : "⚠️";

  if (isSlack(url)) {
    return {
      text: `${emoji} Portinel scan ${scan.status}: \`${scan.target}\``,
      attachments: [
        {
          color: scan.status === "completed" ? (scan.riskScore ?? 100) >= 70 ? "good" : "danger" : "warning",
          fields: [
            { title: "Risk score", value: `${risk}/100 (${grade})`, short: true },
            { title: "Open ports", value: String(scan.openPortCount), short: true },
            { title: "Findings", value: String(scan.results?.findings.length ?? 0), short: true },
            { title: "CVEs", value: String(scan.results?.vulnerabilities.length ?? 0), short: true },
          ],
          text: summary,
        },
      ],
    };
  }
  if (isDiscord(url)) {
    const color = scan.status === "completed" ? (scan.riskScore ?? 100) >= 70 ? 3066993 : 15158332 : 15844367;
    return {
      username: "Portinel",
      embeds: [
        {
          title: `${emoji} Scan ${scan.status}: ${scan.target}`,
          color,
          fields: [
            { name: "Risk", value: `${risk}/100 (${grade})`, inline: true },
            { name: "Open ports", value: String(scan.openPortCount), inline: true },
            { name: "CVEs", value: String(scan.results?.vulnerabilities.length ?? 0), inline: true },
          ],
          description: summary,
        },
      ],
    };
  }
  // Generic JSON payload
  return {
    event: "scan.completed",
    scan: {
      id: scan.id,
      target: scan.target,
      status: scan.status,
      riskScore: scan.riskScore,
      grade: scan.grade,
      openPortCount: scan.openPortCount,
      vulnerabilities: scan.results?.vulnerabilities.length ?? 0,
      completedAt: scan.completedAt,
      summary,
    },
  };
}

export async function fireWebhooksForScan(scan: ScanRecord): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.userId, scan.userId), eq(webhooks.enabled, true)));
    if (!rows.length) return;

    await Promise.all(
      rows.map(async (hook) => {
        try {
          const payload = buildPayload(scan, hook.url);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(hook.url, {
            method: "POST",
            headers: { "content-type": "application/json", "user-agent": UA },
            body: JSON.stringify(payload),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          await db
            .update(webhooks)
            .set({
              lastFiredAt: new Date(),
              lastStatus: res.status,
              deliveryCount: hook.deliveryCount + 1,
            })
            .where(eq(webhooks.id, hook.id));
        } catch (err) {
          await db
            .update(webhooks)
            .set({
              lastFiredAt: new Date(),
              lastStatus: 0,
              deliveryCount: hook.deliveryCount + 1,
            })
            .where(eq(webhooks.id, hook.id));
          console.error(`[webhook ${hook.id}] delivery failed:`, err);
        }
      }),
    );
  } catch (err) {
    console.error("[webhooks] fire failed:", err);
  }
}
