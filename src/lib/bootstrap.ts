// ============================================================================
// bootstrap.ts — Local initialization (master branch).
//
// Seeds a default admin account on first run so the platform is immediately
// usable after `docker compose up`. No Supabase dependency.
// ============================================================================
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { hashPassword } from "./auth";
import { startScheduler } from "./scheduler";

let bootstrapped: Promise<void> | null = null;

export function ensureBootstrap(): Promise<void> {
  if (!bootstrapped) {
    bootstrapped = (async () => {
      try {
        const existing = await db.select().from(users).limit(1);
        if (existing.length > 0) return;

        await db.insert(users).values({
          email: "admin@portinel.io",
          name: "Portinel Admin",
          passwordHash: hashPassword("Portinel!Admin2026"),
          role: "admin",
          plan: "enterprise",
          title: "Platform Administrator",
          company: "Portinel",
          avatarColor: "#a855f7",
        });
        console.log("[bootstrap] Created default admin: admin@portinel.io / Portinel!Admin2026");
      } catch (err) {
        console.error("[bootstrap] failed:", err);
      }
    })();
  }
  startScheduler();
  return bootstrapped;
}
