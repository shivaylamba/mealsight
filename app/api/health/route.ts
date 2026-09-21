import { isConfigured as gradiumConfigured } from '@/lib/gradium';
import { isConfigured as nebiusConfigured } from '@/lib/nebius';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * What is configured, by variable name only. Never a value, so this is safe
 * to leave unauthenticated and to point an uptime check at.
 */
export function GET(): Response {
  const checks = {
    vision: nebiusConfigured('vision'),
    coach: nebiusConfigured('coach'),
    voice: gradiumConfigured(),
  };
  const missing = [
    !process.env.NEBIUS_API_KEY?.trim() && 'NEBIUS_API_KEY',
    !process.env.NEBIUS_VISION_MODEL?.trim() && 'NEBIUS_VISION_MODEL',
    !process.env.NEBIUS_COACH_MODEL?.trim() && 'NEBIUS_COACH_MODEL',
  ].filter((name): name is string => Boolean(name));
  return Response.json(
    { ok: checks.vision && checks.coach, checks, missing },
    { status: checks.vision && checks.coach ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
