import { z } from 'zod';
import { AppError, errorResponse } from '@/lib/errors';
import { speak } from '@/lib/gradium';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 100;

const requestSchema = z.object({ text: z.string().trim().min(1).max(1200) }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = requestSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success)
      throw new AppError('Send between 1 and 1200 characters.', 422, 'invalid_request');
    const audio = await speak(parsed.data.text);
    return Response.json(
      { audio_base64: audio.audioBase64, mime_type: audio.mimeType },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
