/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Per edge-function instance; enough to stop scripted abuse of paid endpoints
 * without adding an external dependency.
 */

const buckets = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs: number): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (now - hits[0])) / 1000));
    buckets.set(key, hits);
    return { allowed: false, retryAfterSeconds };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function clientKey(req: Request, prefix: string): string {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ?? "unknown";
  return `${prefix}:${ip}`;
}
