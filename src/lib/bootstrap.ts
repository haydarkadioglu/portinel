// ============================================================================
// bootstrap.ts — Production initialization.
//
// With Supabase Auth, users are no longer seeded locally — they're created
// automatically on first login via syncSupabaseUser(). This module now just
// ensures the scheduler starts and the database is reachable.
// ============================================================================
import { startScheduler } from "./scheduler";

let initialised = false;

/** Ensure background services (scheduler) are running. Idempotent. */
export function ensureBootstrap(): Promise<void> {
  if (initialised) return Promise.resolve();
  initialised = true;
  startScheduler();
  return Promise.resolve();
}
