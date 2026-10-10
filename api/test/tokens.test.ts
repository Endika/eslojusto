import { describe, expect, it } from 'vitest';
import { buildRequestBody, SYSTEM_PROMPTS } from '../src/adapters/bedrock-reader';
import {
  ESCALATION_MODEL,
  HAIKU_4_5,
  MODEL_SETTINGS,
  PRIMARY_MODEL,
  SONNET_4_6,
} from '../src/config';
import { LIMITS } from '../src/domain/documents';
import { REVIEWS, type ReviewKind } from '../src/domain/reviews';
import {
  EXTRA_OUTPUT_TOKENS_BY_REVIEW,
  imageTokens,
  MAX_ESCALATION_INPUT_TOKENS,
  MAX_ESTIMATED_INPUT_TOKENS,
  PROMPT_TOKENS_BY_REVIEW,
} from '../src/domain/tokens';
import { creditRecord } from './support/credit-largest';
import { employmentRecord, LARGEST } from './support/employment-largest';
import { mortgageRecord } from './support/mortgage-largest';

const PROMPT_TOKENS = PROMPT_TOKENS_BY_REVIEW.final_pay;

// eu-south-2 list prices, USD per token (api/README.md, «Cost»).
const PRICES: Readonly<Record<string, { input: number; output: number }>> = {
  [HAIKU_4_5]: { input: 1.1e-6, output: 5.5e-6 },
  [SONNET_4_6]: { input: 3.3e-6, output: 16.5e-6 },
};
const price = (model: string) => {
  const p = PRICES[model];
  if (!p) throw new Error(`No price for ${model}`);
  return p;
};
const maxOutput = (model: string, review: ReviewKind = 'final_pay') =>
  (MODEL_SETTINGS[model]?.maxTokens ?? Infinity) + EXTRA_OUTPUT_TOKENS_BY_REVIEW[review];
const cost = (model: string, input: number, review: ReviewKind = 'final_pay') =>
  input * price(model).input + maxOutput(model, review) * price(model).output;
// Output priced like the prompt, at two characters per token.
const recordTokens = (record: unknown) => Math.ceil(JSON.stringify(record).length / 2);

const photo = { format: 'image/jpeg' as const, width: 1176, height: LIMITS.maxImageLongSide };

describe('input token estimate', () => {
  it('prices images by w × h / 750, or by 28-pixel patches if that is more', () => {
    // Anthropic's example: a 1269 × 952 image is about 1,600 tokens (1,564 by patches).
    expect(imageTokens({ format: 'image/jpeg', width: 1269, height: 952 })).toBe(1611);
    expect(imageTokens({ format: 'image/jpeg', width: 1568, height: 1568 })).toBe(3279);
  });

  it.each(REVIEWS)(
    'prices the %s prompt and schema at two characters per token or more, with little slack',
    (review) => {
      const body = buildRequestBody(PRIMARY_MODEL, [], review);
      const fixed = JSON.stringify(body['tools']).length + SYSTEM_PROMPTS[review].length;
      expect(PROMPT_TOKENS_BY_REVIEW[review]).toBeGreaterThanOrEqual(Math.ceil(fixed / 2));
      expect(PROMPT_TOKENS_BY_REVIEW[review]).toBeLessThanOrEqual(Math.ceil(fixed / 2) + 1000);
    },
  );

  it('admits the largest pack the API accepts: twenty-five images at the largest size', () => {
    const square = { format: 'image/jpeg' as const, width: 1568, height: 1568 };
    const largest = PROMPT_TOKENS + LIMITS.maxImages * imageTokens(square);
    expect(LIMITS.maxImages).toBe(25);
    expect(largest).toBe(95_975);
    expect(largest).toBeLessThanOrEqual(MAX_ESTIMATED_INPUT_TOKENS);
    expect(PROMPT_TOKENS + LIMITS.maxImages * imageTokens(photo)).toBeLessThan(largest);
  });

  it('admits the largest pack for every review', () => {
    const square = { format: 'image/jpeg' as const, width: 1568, height: 1568 };
    for (const review of REVIEWS)
      expect(
        PROMPT_TOKENS_BY_REVIEW[review] + LIMITS.maxImages * imageTokens(square),
      ).toBeLessThanOrEqual(MAX_ESTIMATED_INPUT_TOKENS);
  });

  it('keeps escalation below the estimate cap', () => {
    expect(MAX_ESCALATION_INPUT_TOKENS).toBeLessThan(MAX_ESTIMATED_INPUT_TOKENS);
  });
});

describe('cost of a read', () => {
  it('stays at or under 0.40 USD for one read at the estimate cap', () => {
    expect(cost(PRIMARY_MODEL, MAX_ESTIMATED_INPUT_TOKENS)).toBeLessThanOrEqual(0.4);
    expect(cost(SONNET_4_6, MAX_ESTIMATED_INPUT_TOKENS)).toBeLessThanOrEqual(0.4);
  });

  it('stays under 0.515 USD for an employment read, with its room for 12,000 tokens out', () => {
    expect(maxOutput(SONNET_4_6, 'employment')).toBe(12_000);
    expect(cost(SONNET_4_6, MAX_ESTIMATED_INPUT_TOKENS, 'employment')).toBeLessThanOrEqual(0.515);
  });

  it('gives only the employment, the credit and the mortgage review more room to write', () => {
    expect(EXTRA_OUTPUT_TOKENS_BY_REVIEW.final_pay).toBe(0);
    expect(EXTRA_OUTPUT_TOKENS_BY_REVIEW.rental).toBe(0);
    expect(EXTRA_OUTPUT_TOKENS_BY_REVIEW.insurance).toBe(0);
  });

  it('stays under 0.515 USD for a credit read, with the employment review’s room to write', () => {
    expect(maxOutput(SONNET_4_6, 'credit')).toBe(12_000);
    expect(cost(SONNET_4_6, MAX_ESTIMATED_INPUT_TOKENS, 'credit')).toBeLessThanOrEqual(0.515);
  });

  it('stays under 0.515 USD for a mortgage read, with the employment review’s room to write', () => {
    expect(maxOutput(SONNET_4_6, 'mortgage')).toBe(12_000);
    expect(cost(SONNET_4_6, MAX_ESTIMATED_INPUT_TOKENS, 'mortgage')).toBeLessThanOrEqual(0.515);
  });

  it('stays at or under 0.40 USD for an insurance read', () => {
    expect(cost(SONNET_4_6, MAX_ESTIMATED_INPUT_TOKENS, 'insurance')).toBeLessThanOrEqual(0.4);
  });

  it('reads with Sonnet alone, so nothing escalates', () => {
    expect(PRIMARY_MODEL).toBe(SONNET_4_6);
    expect(ESCALATION_MODEL).toBe(PRIMARY_MODEL);
  });

  it('keeps the escalated worst case at or under 0.30 USD were Haiku to read first again', () => {
    const escalated =
      cost(HAIKU_4_5, MAX_ESCALATION_INPUT_TOKENS) + cost(SONNET_4_6, MAX_ESCALATION_INPUT_TOKENS);
    expect(escalated).toBeLessThanOrEqual(0.3);
    const employment =
      cost(HAIKU_4_5, MAX_ESCALATION_INPUT_TOKENS, 'employment') +
      cost(SONNET_4_6, MAX_ESCALATION_INPUT_TOKENS, 'employment');
    expect(employment).toBeLessThanOrEqual(0.46);
    const credit =
      cost(HAIKU_4_5, MAX_ESCALATION_INPUT_TOKENS, 'credit') +
      cost(SONNET_4_6, MAX_ESCALATION_INPUT_TOKENS, 'credit');
    expect(credit).toBe(employment);
  });
});

// api/README.md, «Cost», quotes these sizes.
describe('what an employment read records', () => {
  const room = maxOutput(SONNET_4_6, 'employment');

  it('fits every list at its maximum, with texts of the usual length, a tenth under max_tokens', () => {
    const full = recordTokens(employmentRecord({ ...LARGEST, texts: 'typical' }));
    expect(full).toBe(10_846);
    expect(full).toBeLessThanOrEqual(0.91 * room);
  });

  it('fits every copied text at its limit with six payslips and fifteen lines', () => {
    const limit = recordTokens(employmentRecord({ ...LARGEST, lines: 15, contracts: 0 }));
    expect(limit).toBe(11_746);
    expect(limit).toBeLessThanOrEqual(room);
  });

  it('does not fit every list and every copied text at its limit', () => {
    expect(recordTokens(employmentRecord(LARGEST))).toBe(17_708);
  });
});

// api/README.md, «Cost», quotes these sizes.
describe('what a credit read records', () => {
  const room = maxOutput(SONNET_4_6, 'credit');

  it('fits every list at its maximum, with texts of the usual length, a tenth under max_tokens', () => {
    const full = recordTokens(creditRecord('typical'));
    expect(full).toBe(10_696);
    expect(full).toBeLessThanOrEqual(0.91 * room);
  });

  it('does not fit every list and every copied text at its limit', () => {
    expect(recordTokens(creditRecord('largest'))).toBe(12_216);
  });
});

// api/README.md, «Cost», quotes these sizes.
describe('what a mortgage read records', () => {
  const room = maxOutput(SONNET_4_6, 'mortgage');

  it('fits every list at its maximum, with clauses of the usual length, a tenth under max_tokens', () => {
    const full = recordTokens(mortgageRecord('typical'));
    expect(full).toBe(9_622);
    expect(full).toBeLessThanOrEqual(0.91 * room);
  });

  it('does not fit every list and every copied text at its limit', () => {
    expect(recordTokens(mortgageRecord('largest'))).toBe(14_001);
  });
});
