import { z } from 'zod';
import { AppError, errorResponse } from '@/lib/errors';
import { GATE_VERSION, gate } from '@/lib/gate';
import { complete } from '@/lib/nebius';
import { VISION_SYSTEM, visionUser } from '@/lib/prompts';
import { analysisJsonSchema, analysisSchema } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_BODY_BYTES = 12 * 1024 * 1024;

const requestSchema = z
  .object({
    /** A data URL. Images never touch disk; they go straight to the model. */
    image: z
      .string()
      .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/, 'Send a JPEG, PNG or WebP data URL.')
      .max(MAX_BODY_BYTES)
      .nullish(),
    description: z.string().trim().max(2000).nullish(),
  })
  .strict()
  .refine((body) => Boolean(body.image?.trim() || body.description?.trim()), {
    message: 'Send a photograph, a description, or both.',
  });

/** Read the body under a ceiling before parsing, not after. */
async function boundedJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES)
    throw new AppError('That image is too large. Use one under 12 MB.', 413, 'too_large');
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES)
    throw new AppError('That image is too large. Use one under 12 MB.', 413, 'too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('The request body must be valid JSON.', 400, 'invalid_request');
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = requestSchema.safeParse(await boundedJson(request));
    if (!parsed.success)
      throw new AppError(
        parsed.error.issues[0]?.message ?? 'Check the request and try again.',
        422,
        'invalid_request',
      );

    const analysis = await complete({
      purpose: 'vision',
      system: VISION_SYSTEM,
      user: visionUser(parsed.data.description ?? null),
      images: parsed.data.image ? [{ url: parsed.data.image }] : [],
      schemaName: 'meal_analysis',
      jsonSchema: analysisJsonSchema(),
      parse: analysisSchema,
    });

    // Judge the answer before returning it. A refusal here costs one model
    // call; letting it through costs a wrong entry in someone's food diary.
    const verdict = gate(analysis);
    if (verdict.status === 'rejected')
      return Response.json(
        {
          error: verdict.message,
          code: verdict.reason === 'low_confidence' ? 'low_confidence' : 'no_food_detected',
          gate_version: GATE_VERSION,
        },
        { status: 422, headers: { 'Cache-Control': 'no-store' } },
      );

    return Response.json(
      {
        status: verdict.status,
        foods: verdict.foods,
        questions: verdict.questions,
        notes: analysis.notes,
        overall_confidence: analysis.overall_confidence,
        gate_version: GATE_VERSION,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
