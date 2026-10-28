// In-memory fixed-window limits for sign-in and sign-up. One process serves
// everything (server.ts), so a Map is enough; a restart resets the counts.

interface Window {
  count: number;
  resetAt: number;
}

const MAX_KEYS = 10_000;

export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Counts one hit; returns seconds to wait when over the limit, otherwise null. */
  hit(key: string): number | null {
    const now = Date.now();
    let w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      if (this.windows.size >= MAX_KEYS) this.prune(now);
      w = { count: 0, resetAt: now + this.windowMs };
      this.windows.set(key, w);
    }
    w.count++;
    return w.count > this.limit ? Math.ceil((w.resetAt - now) / 1000) : null;
  }

  /** Seconds to wait if `key` is already over the limit, without counting a hit. */
  blocked(key: string): number | null {
    const w = this.windows.get(key);
    const now = Date.now();
    return w && w.resetAt > now && w.count >= this.limit ? Math.ceil((w.resetAt - now) / 1000) : null;
  }

  reset(key: string) {
    this.windows.delete(key);
  }

  private prune(now: number) {
    for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
    // Still full (a flood of distinct keys): drop the oldest rather than grow.
    for (const k of this.windows.keys()) {
      if (this.windows.size < MAX_KEYS) break;
      this.windows.delete(k);
    }
  }
}

const MINUTE = 60_000;

/** Any sign-in attempt, per IP. */
export const loginByIp = new RateLimiter(20, 15 * MINUTE);
/** Failed sign-ins, per e-mail: slows password guessing from many IPs. */
export const loginFailuresByEmail = new RateLimiter(10, 15 * MINUTE);
/** Sign-up attempts (including wrong registration codes), per IP. */
export const registerByIp = new RateLimiter(5, 60 * MINUTE);

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined;

/**
 * The client's IP. The app listens on loopback only, so every request comes
 * through the Cloudflare tunnel, which sets cf-connecting-ip and overwrites
 * any value the client sent.
 */
export function clientIp(headers: HeaderSource): string {
  const get = (name: string) => {
    if (!headers) return undefined;
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const v = headers[name];
    return Array.isArray(v) ? v[0] : v;
  };
  return get('cf-connecting-ip')?.trim() || get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}
