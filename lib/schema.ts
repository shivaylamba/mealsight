import { z } from 'zod';

/**
 * What the vision model is allowed to return.
 *
 * Nutrition numbers are deliberately absent. The model identifies foods and
 * estimates portions; it never reports calories or macros, because a model
 * that is asked for a calorie count will produce a confident one whether or
 * not it has any basis for it. Attaching real numbers is a separate job for a
 * nutrition database, which this project leaves to you.
 */

export const portionRange = z
  .object({
    min_grams: z.number().finite().min(0).max(5000),
    max_grams: z.number().finite().min(0).max(5000),
  })
  .strict()
  .refine((range) => range.min_grams <= range.max_grams, {
    message: 'min_grams must not exceed max_grams',
  });

export const foodSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    /** A plain query for a nutrition database, without adjectives. */
    lookup_query: z.string().trim().min(1).max(240),
    estimated_grams: z.number().finite().min(0).max(5000).nullable(),
    portion_range: portionRange.nullable(),
    preparation: z.string().trim().max(120).nullable(),
    /** The model's own confidence in this item, 0 to 1. Read, not ignored. */
    confidence: z.number().finite().min(0).max(1),
    /** Oil, sauce, butter: things that change the answer but may not be visible. */
    hidden_components: z.array(z.string().trim().min(1).max(160)).max(20),
  })
  .strict();

export type Food = z.infer<typeof foodSchema>;

export const questionSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    question: z.string().trim().min(1).max(300),
    options: z.array(z.string().trim().min(1).max(120)).max(6),
  })
  .strict();

export const rejectionReason = z.enum(['no_food', 'unreadable', 'not_a_meal']);
export type RejectionReason = z.infer<typeof rejectionReason>;

export const analysisSchema = z
  .object({
    /**
     * Asked directly rather than inferred from an empty list, because a model
     * told only to list foods will list something for any image.
     */
    contains_food: z.boolean(),
    rejection_reason: rejectionReason.nullable(),
    foods: z.array(foodSchema).max(40),
    questions: z.array(questionSchema).max(8),
    overall_confidence: z.number().finite().min(0).max(1),
    notes: z.array(z.string().trim().min(1).max(240)).max(12),
  })
  .strict();

export type Analysis = z.infer<typeof analysisSchema>;

/** The JSON Schema sent to the provider, kept beside the Zod it mirrors. */
export function analysisJsonSchema(): Record<string, unknown> {
  const numberOrNull = { type: ['number', 'null'] };
  const stringOrNull = { type: ['string', 'null'] };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'contains_food',
      'rejection_reason',
      'foods',
      'questions',
      'overall_confidence',
      'notes',
    ],
    properties: {
      contains_food: { type: 'boolean' },
      rejection_reason: {
        type: ['string', 'null'],
        enum: ['no_food', 'unreadable', 'not_a_meal', null],
      },
      overall_confidence: { type: 'number' },
      notes: { type: 'array', items: { type: 'string' } },
      foods: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'name',
            'lookup_query',
            'estimated_grams',
            'portion_range',
            'preparation',
            'confidence',
            'hidden_components',
          ],
          properties: {
            name: { type: 'string' },
            lookup_query: { type: 'string' },
            estimated_grams: numberOrNull,
            portion_range: {
              type: ['object', 'null'],
              additionalProperties: false,
              required: ['min_grams', 'max_grams'],
              properties: { min_grams: { type: 'number' }, max_grams: { type: 'number' } },
            },
            preparation: stringOrNull,
            confidence: { type: 'number' },
            hidden_components: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      questions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'question', 'options'],
          properties: {
            id: { type: 'string' },
            question: { type: 'string' },
            options: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  };
}

export const coachReplySchema = z
  .object({
    answer: z.string().trim().min(1).max(1200),
    /** Names of foods from the analysis that the answer relies on. */
    based_on: z.array(z.string().trim().min(1).max(200)).max(20),
  })
  .strict();

export type CoachReply = z.infer<typeof coachReplySchema>;

export function coachJsonSchema(): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['answer', 'based_on'],
    properties: {
      answer: { type: 'string' },
      based_on: { type: 'array', items: { type: 'string' } },
    },
  };
}
