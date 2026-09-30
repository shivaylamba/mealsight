import { NextResponse, type NextRequest } from 'next/server';
import { clientKey, createLimiter } from '@/lib/ratelimit';

const WINDOW_MS = 10 * 60 * 1000;
const configured = Number(process.env.RATE_LIMIT_PER_10_MIN);
const LIMIT = Number.isInteger(configured) && configured > 0 ? configured : 30;

const limiter = createLimiter(LIMIT, WINDOW_MS);

export function proxy(request: NextRequest) {
  const wait = limiter.check(clientKey(request.headers));
  if (wait === 0) return NextResponse.next();
  return NextResponse.json(
    { error: 'Too many requests from this address. Try again shortly.', code: 'rate_limited' },
    { status: 429, headers: { 'Retry-After': String(wait), 'Cache-Control': 'no-store' } },
  );
}

// Only the routes that spend model or speech credit; /api/health stays open.
export const config = {
  matcher: ['/api/analyze', '/api/coach', '/api/voice/:path*'],
};
