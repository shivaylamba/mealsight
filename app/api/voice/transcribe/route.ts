import { AppError, errorResponse } from '@/lib/errors';
import { transcribe } from '@/lib/gradium';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 100;

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

export async function POST(request: Request): Promise<Response> {
  try {
    const declared = Number(request.headers.get('content-length') ?? NaN);
    if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES)
      throw new AppError('Keep recordings under 8 MB.', 413, 'audio_too_large');
    const audio = new Uint8Array(await request.arrayBuffer());
    const text = await transcribe(audio);
    return Response.json({ text }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
