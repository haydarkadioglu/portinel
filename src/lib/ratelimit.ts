// ============================================================================
// ratelimit.ts — Lightweight in-memory token-bucket rate limiter.
// Per-process; documented as a place to swap in Redis for horizontal scale.
// ============================================================================
const buckets = new Map<
  string,
  { tokens: number; last: number; capacity: number; refillPerSec: number }
>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

export function rateLimit(
  key: string,
  capacity = 60,
  refillPerSec = 1,
): RateLimitResult {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, last: now, capacity, refillPerSec };
    buckets.set(key, bucket);
  }
  const elapsed = (now - bucket.last) / 1000;
  bucket.tokens = Math.min(
    bucket.capacity,
    bucket.tokens + elapsed * bucket.refillPerSec,
  );
  bucket.last = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      ok: true,
      remaining: Math.floor(bucket.tokens),
      retryAfterMs: 0,
      limit: bucket.capacity,
    };
  }
  const deficit = 1 - bucket.tokens;
  return {
    ok: false,
    remaining: 0,
    retryAfterMs: Math.ceil((deficit / bucket.refillPerSec) * 1000),
    limit: bucket.capacity,
  };
}

// Periodic cleanup to avoid unbounded growth of the in-memory map.
const cleanupHandle = setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) {
    if (now - v.last > 10 * 60 * 1000) buckets.delete(k);
  }
}, 60 * 1000);
if (typeof (cleanupHandle as { unref?: () => void }).unref === "function") {
  (cleanupHandle as { unref: () => void }).unref();
}
