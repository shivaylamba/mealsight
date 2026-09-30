/**
 * A fixed-window counter per client, held in memory.
 *
 * On a serverless host each instance keeps its own counts, so this bounds a
 * burst from one address rather than guaranteeing a global quota. That is
 * the point: a public deployment spends the owner's model credit, and one
 * script looping on /api/analyze should not be able to spend all of it.
 * A spending cap on the provider account is still the real backstop.
 */
export interface Limiter {
  /** Seconds until the caller may retry, or 0 if this request is allowed. */
  check(key: string, now?: number): number;
}

export function createLimiter(limit: number, windowMs: number, maxKeys = 10_000): Limiter {
  const windows = new Map<string, { start: number; count: number }>();

  return {
    check(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || now - current.start >= windowMs) {
        // Drop expired entries before the map grows without bound.
        if (windows.size >= maxKeys) {
          for (const [k, w] of windows) if (now - w.start >= windowMs) windows.delete(k);
          if (windows.size >= maxKeys) windows.clear();
        }
        windows.set(key, { start: now, count: 1 });
        return 0;
      }
      if (current.count < limit) {
        current.count += 1;
        return 0;
      }
      return Math.max(1, Math.ceil((current.start + windowMs - now) / 1000));
    },
  };
}

/** The caller's address as the host reports it; Vercel sets the first entry. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}
