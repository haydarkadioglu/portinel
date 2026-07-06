// ============================================================================
// notifications.ts — Diff-based notification engine.
//
// After each scan completes, this compares the result against the target's
// previous scan and persists concrete notifications for real changes:
//   • ports that opened or closed
//   • TLS certificates nearing expiry
//   • risk score increases
//   • newly appearing services / findings
// This replaces the previous ephemeral (on-the-fly computed) notifications.
// ============================================================================
import { db } from "@/db";
import { scans, notifications } from "@/db/schema";
import { eq, desc, lt, and } from "drizzle-orm";
import type { ScanResult, Severity } from "./types";

const CERT_WARN_DAYS = 30;

export async function checkAndNotify(
  scanId: string,
  userId: string,
): Promise<void> {
  const [current] = await db.select().from(scans).where(eq(scans.id, scanId)).limit(1);
  if (!current || !current.results) return;
  const result = current.results as ScanResult;

  // Find the most recent prior completed scan of the same target.
  const [prior] = await db
    .select()
    .from(scans)
    .where(
      and(
        eq(scans.userId, userId),
        eq(scans.target, current.target),
        eq(scans.status, "completed"),
        lt(scans.createdAt, current.createdAt),
      ),
    )
    .orderBy(desc(scans.createdAt))
    .limit(1);

  const priorResult = (prior?.results as ScanResult | null) ?? null;
  const notes: { type: string; title: string; text: string; severity: Severity }[] = [];

  // --- Certificate expiry ----------------------------------------------------
  for (const cert of result.ssl) {
    if (cert.daysUntilExpiry < 0) {
      notes.push({
        type: "cert_expired",
        title: "TLS certificate expired",
        text: `${current.target}: the certificate for ${cert.subjectCN} expired ${Math.abs(cert.daysUntilExpiry)} days ago.`,
        severity: "critical",
      });
    } else if (cert.daysUntilExpiry < CERT_WARN_DAYS) {
      notes.push({
        type: "cert_expiring",
        title: "TLS certificate expiring soon",
        text: `${current.target}: certificate for ${cert.subjectCN} expires in ${cert.daysUntilExpiry} days.`,
        severity: "high",
      });
    }
  }

  // --- Port changes ----------------------------------------------------------
  const nowOpen = new Set(
    result.ports.filter((p) => p.state === "open").map((p) => p.port),
  );
  const prevOpen = new Set(
    priorResult?.ports.filter((p) => p.state === "open").map((p) => p.port) ?? [],
  );
  const newlyOpened = [...nowOpen].filter((p) => !prevOpen.has(p));
  const newlyClosed = [...prevOpen].filter((p) => !nowOpen.has(p));
  if (newlyOpened.length) {
    notes.push({
      type: "ports_opened",
      title: "New ports opened",
      text: `${current.target}: ${newlyOpened.length} new open port(s): ${newlyOpened.slice(0, 8).join(", ")}.`,
      severity: newlyOpened.length > 2 ? "high" : "medium",
    });
  }
  if (newlyClosed.length) {
    notes.push({
      type: "ports_closed",
      title: "Ports closed",
      text: `${current.target}: ${newlyClosed.length} port(s) now closed: ${newlyClosed.slice(0, 8).join(", ")}.`,
      severity: "info",
    });
  }

  // --- New services / findings ----------------------------------------------
  const prevFindingTitles = new Set(priorResult?.findings.map((f) => f.title) ?? []);
  const newFindings = result.findings.filter(
    (f) => f.severity !== "info" && !prevFindingTitles.has(f.title),
  );
  if (newFindings.length) {
    const critical = newFindings.filter((f) => f.severity === "critical").length;
    notes.push({
      type: "new_findings",
      title: "New security findings",
      text: `${current.target}: ${newFindings.length} new finding(s) detected${critical ? `, ${critical} critical` : ""}.`,
      severity: critical ? "critical" : "medium",
    });
  }

  // --- Risk increase ---------------------------------------------------------
  if (priorResult && result.risk.score < priorResult.risk.score) {
    const delta = priorResult.risk.score - result.risk.score;
    if (delta >= 5) {
      notes.push({
        type: "risk_increase",
        title: "Risk score increased",
        text: `${current.target}: security score dropped by ${delta} points (${priorResult.risk.score} → ${result.risk.score}).`,
        severity: delta >= 15 ? "high" : "medium",
      });
    }
  }

  // Persist notifications.
  if (notes.length) {
    await db.insert(notifications).values(
      notes.map((n) => ({
        userId,
        scanId,
        type: n.type,
        title: n.title,
        message: n.text,
        severity: n.severity,
      })),
    );
  }
}
