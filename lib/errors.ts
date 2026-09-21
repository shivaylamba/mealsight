/** A failure the caller can act on, with a status the route can return. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** Seconds to wait, when the provider told us. */
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/**
 * Read `Retry-After`, which is either a delay in seconds or an HTTP date.
 * A missing or unusable value yields null rather than a guess.
 */
export function parseRetryAfter(header: string | null, now = Date.now()): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    return seconds > 0 && seconds <= 86_400 ? seconds : null;
  }
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return null;
  const seconds = Math.ceil((date - now) / 1000);
  return seconds > 0 && seconds <= 86_400 ? seconds : null;
}

/** One JSON error shape for every route, so the client never guesses. */
export function errorResponse(error: unknown): Response {
  const known = error instanceof AppError;
  const status = known ? error.status : 500;
  const body: Record<string, unknown> = {
    error: known ? error.message : 'Something went wrong on our side.',
    code: known ? error.code : 'internal_error',
  };
  if (known && error.retryAfterSeconds) body.retry_after_seconds = error.retryAfterSeconds;
  if (!known) console.error('unhandled route failure', error);
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...(known && error.retryAfterSeconds
        ? { 'Retry-After': String(error.retryAfterSeconds) }
        : {}),
    },
  });
}
