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
import { employmentRecord, LARGEST } from './support/employment-largest';

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

  it('stays at or under 0.52 USD for an employment read, with its room for 12,000 tokens out', () => {
    expect(maxOutput(SONNET_4_6, 'employment')).toBe(12_000);
    expect(cost(SONNET_4_6, MAX_ESTIMATED_INPUT_TOKENS, 'employment')).toBeLessThanOrEqual(0.52);
  });

  it('gives only the employment review more room to write', () => {
    expect(EXTRA_OUTPUT_TOKENS_BY_REVIEW.final_pay).toBe(0);
    expect(EXTRA_OUTPUT_TOKENS_BY_REVIEW.rental).toBe(0);
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
  });
});

// api/README.md, «Cost», quotes these sizes.
describe('what an employment read records', () => {
  const typical = (payslips: number, lines: number, contracts: number) =>
    recordTokens(employmentRecord({ payslips, lines, contracts, texts: 'typical' }));

  it('fits a contract with six payslips in its max_tokens', () => {
    expect(typical(6, 72, 0)).toBe(10_021);
    expect(typical(6, 72, 0)).toBeLessThanOrEqual(maxOutput(SONNET_4_6, 'employment'));
  });

  it('may not fit twelve payslips with every line and a long work history', () => {
    expect(typical(12, 144, 0)).toBe(15_202);
    expect(typical(12, 150, 60)).toBe(22_363);
    expect(recordTokens(employmentRecord(LARGEST))).toBe(33_521);
  });
});
