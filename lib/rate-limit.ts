export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export interface RateLimiter {
  consume(key: string, now?: number): RateLimitResult;
}

// Fenetre glissante en memoire (best-effort, cf. design : "compteur simple en
// memoire/edge"). Ne survit PAS a un cold start serverless ni ne partage
// l'etat entre plusieurs instances Vercel - protection best-effort contre un
// abus grossier, pas un rempart distribue (un vrai rate limit distribue,
// ex. Vercel Firewall / Upstash, est hors scope de cette iteration).
export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  const hits = new Map<string, number[]>();
  return {
    consume(key: string, now: number = Date.now()): RateLimitResult {
      const windowStart = now - windowMs;
      const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);
      if (timestamps.length >= limit) {
        const oldest = timestamps[0];
        return { allowed: false, retryAfterMs: oldest + windowMs - now };
      }
      timestamps.push(now);
      hits.set(key, timestamps);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}

// Vercel pose x-forwarded-for (liste eventuelle "client, proxy1, proxy2") -
// on ne retient que la premiere entree (l'appelant direct).
export function extractClientIp(request: Request): string {
  const header = request.headers.get("x-forwarded-for");
  if (!header) return "unknown";
  const [first] = header.split(",");
  return first.trim() || "unknown";
}
