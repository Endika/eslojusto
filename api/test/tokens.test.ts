import { describe, expect, it } from 'vitest';
import { buildRequestBody, SYSTEM_PROMPT } from '../src/adapters/bedrock-reader';
import {
  ESCALATION_MODEL,
  HAIKU_4_5,
  MODEL_SETTINGS,
  PRIMARY_MODEL,
  SONNET_4_6,
} from '../src/config';
import { LIMITS } from '../src/domain/documents';
import {
  imageTokens,
  MAX_ESCALATION_INPUT_TOKENS,
  MAX_ESTIMATED_INPUT_TOKENS,
  PROMPT_TOKENS,
} from '../src/domain/tokens';

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
const maxOutput = (model: string) => MODEL_SETTINGS[model]?.maxTokens ?? Infinity;
const cost = (model: string, input: number) =>
  input * price(model).input + maxOutput(model) * price(model).output;

const photo = { format: 'image/jpeg' as const, width: 1176, height: LIMITS.maxImageLongSide };

describe('input token estimate', () => {
  it('prices images by w × h / 750, or by 28-pixel patches if that is more', () => {
    // Anthropic's example: a 1269 × 952 image is about 1,600 tokens (1,564 by patches).
    expect(imageTokens({ format: 'image/jpeg', width: 1269, height: 952 })).toBe(1611);
    expect(imageTokens({ format: 'image/jpeg', width: 1568, height: 1568 })).toBe(3279);
  });

  it('prices the prompt and schema at two characters per token or more', () => {
    const body = buildRequestBody(PRIMARY_MODEL, []);
    const fixed = JSON.stringify(body['tools']).length + SYSTEM_PROMPT.length;
    expect(PROMPT_TOKENS).toBeGreaterThanOrEqual(Math.ceil(fixed / 2));
  });

  it('admits the largest pack the API accepts: fifteen images at the largest size', () => {
    const square = { format: 'image/jpeg' as const, width: 1568, height: 1568 };
    const largest = PROMPT_TOKENS + LIMITS.maxImages * imageTokens(square);
    expect(largest).toBe(63_185);
    expect(largest).toBeLessThanOrEqual(MAX_ESTIMATED_INPUT_TOKENS);
    expect(PROMPT_TOKENS + LIMITS.maxImages * imageTokens(photo)).toBeLessThan(largest);
  });

  it('keeps escalation below the estimate cap', () => {
    expect(MAX_ESCALATION_INPUT_TOKENS).toBeLessThan(MAX_ESTIMATED_INPUT_TOKENS);
  });
});

describe('cost of a read', () => {
  it('stays at or under 0.30 USD for one read at the estimate cap', () => {
    expect(cost(PRIMARY_MODEL, MAX_ESTIMATED_INPUT_TOKENS)).toBeLessThanOrEqual(0.3);
    expect(cost(SONNET_4_6, MAX_ESTIMATED_INPUT_TOKENS)).toBeLessThanOrEqual(0.3);
  });

  it('reads with Sonnet alone, so nothing escalates', () => {
    expect(PRIMARY_MODEL).toBe(SONNET_4_6);
    expect(ESCALATION_MODEL).toBe(PRIMARY_MODEL);
  });

  it('keeps the escalated worst case at or under 0.30 USD were Haiku to read first again', () => {
    const escalated =
      cost(HAIKU_4_5, MAX_ESCALATION_INPUT_TOKENS) + cost(SONNET_4_6, MAX_ESCALATION_INPUT_TOKENS);
    expect(escalated).toBeLessThanOrEqual(0.3);
  });
});
