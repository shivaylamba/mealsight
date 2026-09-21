import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, THRESHOLDS, gate } from '../lib/gate';
import { analysisSchema, type Analysis, type Food } from '../lib/schema';

function food(overrides: Partial<Food> = {}): Food {
  return {
    name: 'Grilled chicken',
    lookup_query: 'grilled chicken breast',
    estimated_grams: 120,
    portion_range: { min_grams: 90, max_grams: 160 },
    preparation: null,
    confidence: 0.9,
    hidden_components: [],
    ...overrides,
  };
}

/** Built through the real schema, so a fixture cannot drift away from it. */
function analysis(overrides: Partial<Analysis> = {}): Analysis {
  return analysisSchema.parse({
    contains_food: true,
    rejection_reason: null,
    foods: [food()],
    questions: [],
    overall_confidence: 0.9,
    notes: [],
    ...overrides,
  });
}

describe('refusing what is not a meal', () => {
  test('a model that says there is no food is believed', () => {
    for (const reason of ['no_food', 'unreadable', 'not_a_meal'] as const) {
      const result = gate(analysis({ contains_food: false, rejection_reason: reason, foods: [] }));
      assert.equal(result.status, 'rejected');
      assert.equal(result.status === 'rejected' && result.reason, reason);
      // Every refusal offers both ways forward.
      assert.match(MESSAGES[reason], /Retake the photo, or describe the meal/);
    }
  });

  test('"a car" is refused even when it arrives as a schema-valid food', () => {
    const result = gate(
      analysis({
        contains_food: false,
        rejection_reason: 'not_a_meal',
        foods: [food({ name: 'Car', lookup_query: 'car', confidence: 0.8 })],
      }),
    );
    assert.equal(result.status, 'rejected');
  });

  test('an empty list is a refusal, not an empty meal', () => {
    assert.equal(gate(analysis({ foods: [] })).status, 'rejected');
  });

  test('a self-contradictory answer is refused', () => {
    // Foods listed while asserting no confidence in them.
    assert.equal(gate(analysis({ overall_confidence: 0.01 })).status, 'rejected');
  });
});

describe('confidence decides between asking and accepting', () => {
  test('a confident reading is ready to use', () => {
    assert.equal(gate(analysis({ overall_confidence: 0.9 })).status, 'ready');
  });

  test('an unsure reading is confirmed rather than refused', () => {
    // 0.2 is what a real but unmeasured portion scores. Refusing it would
    // turn away a genuine meal because the person did not weigh it.
    for (const confidence of [0.2, 0.35, 0.5]) {
      const result = gate(analysis({ overall_confidence: confidence }));
      assert.equal(result.status, 'needs_confirmation', `confidence ${confidence} was refused`);
    }
  });

  test('one unsure item makes the whole meal worth confirming', () => {
    const result = gate(
      analysis({
        overall_confidence: 0.85,
        foods: [food(), food({ name: 'Sauce', confidence: 0.3 })],
      }),
    );
    assert.equal(result.status, 'needs_confirmation');
  });

  test('the boundaries are where they claim to be', () => {
    const atFloor: string = gate(analysis({ overall_confidence: THRESHOLDS.reject })).status;
    assert.notEqual(atFloor, 'rejected');
    const belowFloor: string = gate(
      analysis({ overall_confidence: THRESHOLDS.reject - 0.01 }),
    ).status;
    assert.equal(belowFloor, 'rejected');
  });
});

describe('asking a useful question', () => {
  test('an unsure reading with no question of its own is given one', () => {
    const result = gate(
      analysis({
        overall_confidence: 0.45,
        foods: [food({ name: 'Rice', confidence: 0.8 }), food({ name: 'Dal', confidence: 0.45 })],
      }),
    );
    if (result.status === 'rejected') return assert.fail('a real meal was refused');
    assert.equal(result.status, 'needs_confirmation');
    // It names the item the model was least sure about.
    assert.equal(result.questions[0].question, 'Is this Dal?');
    assert.deepEqual(result.questions[0].options, ['Dal', 'Something else']);
  });

  test("the model's own question is kept instead of a synthesised one", () => {
    const result = gate(
      analysis({
        overall_confidence: 0.45,
        questions: [{ id: 'q1', question: 'Was the rice fried?', options: [] }],
      }),
    );
    if (result.status === 'rejected') return assert.fail('should not be rejected');
    assert.equal(result.questions.length, 1);
    assert.equal(result.questions[0].id, 'q1');
  });
});
