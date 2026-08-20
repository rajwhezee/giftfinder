/**
 * Best-effort per-IP rate limiting, in process memory.
 *
 * Be clear about what this is and is not. Vercel runs these routes as
 * serverless functions, so each concurrent instance keeps its own counter and
 * a caller spread across ten warm instances gets ten times the allowance. A
 * cold start resets everything. It stops a script hammering one endpoint from
 * one address, which is the abuse this actually sees; it is not a defence
 * against a distributed attack, and it must not be relied on as one.
 *
 * The reason it is here rather than an Upstash or Vercel Firewall rule is that
 * both need an account and a credential this project does not have yet. When
 * one exists, replace the internals of `rateLimit` and leave the call sites
 * alone. Until then a weak limiter beats none: /api/recommend scans thousands
 * of rows per call and Neon bills for every one, so an unbounded endpoint is a
 * billing risk as much as an availability one.
 */

interface Window {
  count: number;
  /** When the current window began, in ms. */
  start: number;
}

const windows = new Map<string, Window>();

/**
 * Ceiling on tracked keys, so a flood of unique addresses cannot grow the map
 * until the function runs out of memory — the limiter becoming the outage is a
 * poor trade. Well past any real traffic this site sees.
 */
const MAX_TRACKED = 10_000;

export interface RateLimitResult {
  ok: boolean;
  /** Seconds until the window resets. Sent as Retry-After on a rejection. */
  retryAfter: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = windows.get(key);

  if (!existing || now - existing.start >= windowMs) {
    // Cheapest possible eviction: when full, drop the oldest insertion. Map
    // preserves insertion order, so the first key is the least recently
    // *created* window, which for a fixed window is close enough to the least
    // recently used.
    if (windows.size >= MAX_TRACKED) {
      const oldest = windows.keys().next().value;
      if (oldest !== undefined) windows.delete(oldest);
    }
    windows.set(key, { count: 1, start: now });
    return { ok: true, retryAfter: 0 };
  }

  existing.count++;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.start + windowMs - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * The caller's address, as far as it can be known.
 *
 * On Vercel `x-forwarded-for` is set by the platform edge and the leftmost
 * entry is the client. Anywhere the header is absent or forged this degrades
 * to a shared bucket, which is the safe direction: it throttles more, not
 * less.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  return ip && ip.length > 0 ? ip : "unknown";
}

/** 429 with the headers a well-behaved client needs to back off. */
export function tooManyRequests(retryAfter: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.max(retryAfter, 1)),
      "Cache-Control": "no-store",
    },
  });
}
