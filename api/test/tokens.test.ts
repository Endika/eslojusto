import { describe, expect, it } from 'vitest';
import {
  imageTokens,
  MAX_ESCALATION_INPUT_TOKENS,
  MAX_ESTIMATED_INPUT_TOKENS,
  pdfTokens,
  PROMPT_TOKENS,
} from '../src/domain/tokens';

describe('input token estimate', () => {
  it('prices images with Claude’s 28-pixel patches', () => {
    // Anthropic's own example: a 1269 × 952 image costs 1,564 tokens.
    expect(imageTokens({ format: 'image/jpeg', width: 1269, height: 952 })).toBe(1564);
  });

  it('prices PDF pages as an image plus their text', () => {
    expect(pdfTokens(2, 6001)).toBe(2 * 1600 + 3001);
  });

  it('admits the largest legitimate uploads', () => {
    const fourPhotos =
      PROMPT_TOKENS + 4 * imageTokens({ format: 'image/jpeg', width: 1176, height: 1568 });
    // Four dense pages: about 9,000 bytes of text each, more than real payslips carry.
    const denseFourPages = PROMPT_TOKENS + pdfTokens(4, 4 * 9000);
    expect(fourPhotos).toBeLessThan(MAX_ESTIMATED_INPUT_TOKENS);
    expect(denseFourPages).toBeLessThan(MAX_ESTIMATED_INPUT_TOKENS);
  });

  it('keeps escalation below the estimate cap', () => {
    expect(MAX_ESCALATION_INPUT_TOKENS).toBeLessThan(MAX_ESTIMATED_INPUT_TOKENS);
  });
});
