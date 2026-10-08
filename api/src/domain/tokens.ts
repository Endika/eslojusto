import type { ImageSize } from './image-dimensions';
import type { ReviewKind } from './reviews';

// CountTokens on bedrock-runtime does not serve Claude models offered only through
// cross-Region profiles, so input is estimated here, erring high.

// System prompt, tool schema, page labels and Anthropic's tool-use preamble of each review, priced
// at two characters per token like document text (test/tokens.test.ts keeps it honest): about
// 27,000 characters for the final pay, 21,000 for the rental review and 28,000 for the
// employment review.
export const PROMPT_TOKENS_BY_REVIEW: Readonly<Record<ReviewKind, number>> = {
  final_pay: 14_000,
  rental: 11_000,
  employment: 14_000,
};
// Output tokens a review's record can need beyond a model's max_tokens (MODEL_SETTINGS in
// src/config.ts), for Sonnet 5.5 as much as for Sonnet 4.6. With every employment list at its
// maximum and texts of the usual length, a record is about 21,700 characters, 10,850 tokens at two
// characters each: a tenth under the 12,000 of Sonnet 4.6, which is also about as much as it can
// write before READ_DEADLINE_MS (api/README.md, «Cost»).
export const EXTRA_OUTPUT_TOKENS_BY_REVIEW: Readonly<Record<ReviewKind, number>> = {
  final_pay: 0,
  rental: 0,
  employment: 7_000,
};
// One Sonnet read at this cap costs 96,000 × 3.30 + 5,000 × 16.50 USD per million = 0.40 USD,
// and at most about 0.51 USD for an employment read with its 12,000 output tokens (api/README.md,
// «Cost»). The
// largest pack the API accepts, twenty-five 1568 × 1568 images, comes to 14,000 + 25 × 3,279 =
// 95,975 for the final pay and the employment review and 92,975 for a rental review, so the cap
// is a guard rather than a limit anyone meets.
export const MAX_ESTIMATED_INPUT_TOKENS = 96_000;
// Only when a cheaper model reads first. Measured by Bedrock after the primary read, so exact;
// above it a second, dearer read would take the worst case past 0.30 USD for the final pay and the
// rental review; an employment read, with more room to write, could reach about 0.45 USD
// (api/README.md, «Cost»).
export const MAX_ESCALATION_INPUT_TOKENS = 43_000;

// A read that costs more than this many times its estimate means the estimator was fooled.
export const UNDERESTIMATE_FACTOR = 2;

// Anthropic's formula, w × h / 750, or one token per 28 × 28 patch if that comes out higher.
export const imageTokens = ({ width, height }: ImageSize): number =>
  Math.max(Math.ceil((width * height) / 750), Math.ceil(width / 28) * Math.ceil(height / 28));
