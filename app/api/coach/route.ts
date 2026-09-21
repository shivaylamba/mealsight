import { z } from 'zod';
import { AppError, errorResponse } from '@/lib/errors';
import { complete } from '@/lib/nebius';
import { COACH_SYSTEM, coachUser } from '@/lib/prompts';
import { coachJsonSchema, coachReplySchema, foodSchema } from '@/lib/schema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 110;

const requestSchema = z
  .object({
    foods: z.array(foodSchema).min(1).max(40),
    question: z.string().trim().min(1).max(500),
  })
  .strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 256 * 1024)
      throw new AppError('That request is too large.', 413, 'too_large');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      throw new AppError('The request body must be valid JSON.', 400, 'invalid_request');
    }
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError('Ask a question about an analysed meal.', 422, 'invalid_request');

    // The model is given only the analysed foods, never the raw photograph or
    // anything else, so an answer cannot drift onto evidence nobody reviewed.
    const reply = await complete({
      purpose: 'coach',
      system: COACH_SYSTEM,
      user: coachUser(JSON.stringify(parsed.data.foods), parsed.data.question),
      schemaName: 'coach_reply',
      jsonSchema: coachJsonSchema(),
      parse: coachReplySchema,
      maxTokens: 1024,
    });

    return Response.json(reply, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return errorResponse(error);
  }
}
