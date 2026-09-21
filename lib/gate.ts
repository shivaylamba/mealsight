import type { Analysis, Food, RejectionReason } from './schema';

/**
 * Judging model output, not just parsing it.
 *
 * A schema proves a response is well formed. It says nothing about whether the
 * answer is sensible: "I ate a car" parses perfectly into an item named "car",
 * and a photograph of a wall yields a confident-looking list of foods. Most
 * applications validate the shape, read the foods, and never look at the
 * confidence the model reported alongside them.
 *
 * This gate reads it. It runs after validation and before anything is shown,
 * so a refusal costs one model call rather than a wrong entry in someone's
 * food diary.
 */

export const GATE_VERSION = 'gate-v1';

export const THRESHOLDS = {
  /**
   * Reject only a self-contradictory answer: foods listed while asserting
   * essentially no confidence in them.
   *
   * Deliberately low. Measured against 22 models, every non-meal was caught by
   * `contains_food`, whose confidence scores ranged the full 0 to 1 and so
   * carried no signal about edibility. What confidence actually expresses is
   * portion uncertainty: "some leftover pasta, not sure how much" comes back
   * around 0.2. Refusing that turns away a real meal because the person did
   * not weigh it, which is what the confirmation path is for.
   */
  reject: 0.05,
  /** Below this, ask before accepting. */
  clarify: 0.6,
  /** One item this unsure makes the whole meal worth confirming. */
  item: 0.4,
} as const;

export type GateResult =
  | { status: 'rejected'; reason: RejectionReason | 'low_confidence'; message: string }
  | {
      status: 'needs_confirmation' | 'ready';
      foods: Food[];
      questions: Analysis['questions'];
    };

/** Every refusal offers both ways forward, because the person knows what they ate. */
export const MESSAGES = {
  no_food: "We couldn't find food here. Retake the photo, or describe the meal instead.",
  unreadable: "We couldn't read this clearly. Retake the photo, or describe the meal instead.",
  not_a_meal: "That doesn't look like a meal. Retake the photo, or describe the meal instead.",
  low_confidence:
    "We couldn't read this well enough to be useful. Retake the photo, or describe the meal instead.",
} as const satisfies Record<RejectionReason | 'low_confidence', string>;

function leastCertain(foods: readonly Food[]): Food | null {
  return foods.reduce<Food | null>(
    (lowest, food) => (lowest === null || food.confidence < lowest.confidence ? food : lowest),
    null,
  );
}

export function gate(analysis: Analysis): GateResult {
  // The model was asked directly whether this is food. Believe it.
  if (!analysis.contains_food) {
    const reason = analysis.rejection_reason ?? 'no_food';
    return { status: 'rejected', reason, message: MESSAGES[reason] };
  }
  if (analysis.foods.length === 0)
    return { status: 'rejected', reason: 'no_food', message: MESSAGES.no_food };
  if (analysis.overall_confidence < THRESHOLDS.reject)
    return { status: 'rejected', reason: 'low_confidence', message: MESSAGES.low_confidence };

  const unsure = leastCertain(analysis.foods);
  const needsConfirmation =
    analysis.overall_confidence < THRESHOLDS.clarify ||
    (unsure !== null && unsure.confidence < THRESHOLDS.item) ||
    analysis.questions.length > 0;

  // Asking for confirmation without saying what to confirm is a dead end, so
  // an unsure answer with no question of its own is given one.
  const questions =
    needsConfirmation && analysis.questions.length === 0 && unsure
      ? [
          {
            id: `gate-${unsure.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
            question: `Is this ${unsure.name}?`,
            options: [unsure.name, 'Something else'],
          },
        ]
      : analysis.questions;

  return {
    status: needsConfirmation ? 'needs_confirmation' : 'ready',
    foods: analysis.foods,
    questions,
  };
}
