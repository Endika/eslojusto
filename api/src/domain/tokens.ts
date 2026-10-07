import type { ImageSize } from './image-dimensions';

// CountTokens on bedrock-runtime does not serve Claude models offered only through
// cross-Region profiles, so input is estimated here, erring high.

// System prompt, tool schema and Anthropic's tool-use preamble; about 1,500 when measured by
// hand, doubled.
export const PROMPT_TOKENS = 3000;
// Claude renders each PDF page as an image at the 1568 px tier: 33 × 47 = 1,551 for A4.
export const PDF_PAGE_IMAGE_TOKENS = 1600;
// Text costs about a token per 3–4 characters, and numbers more; two bytes per token errs high.
export const TEXT_BYTES_PER_TOKEN = 2;

// Four dense pages really cost about 4 × (3,000 + 1,551) + 1,500 ≈ 19,700 tokens; the estimate
// for them stays under this, with room for the estimator's pessimism.
export const MAX_ESTIMATED_INPUT_TOKENS = 32_000;
// Measured by Bedrock after the primary read, so exact: legitimate documents stay below it,
// and above it a second, dearer read is never worth it.
export const MAX_ESCALATION_INPUT_TOKENS = 25_000;

// Claude's own formula: one token per 28 × 28 patch.
export const imageTokens = ({ width, height }: ImageSize): number =>
  Math.ceil(width / 28) * Math.ceil(height / 28);

export const pdfTokens = (pages: number, textBytes: number): number =>
  pages * PDF_PAGE_IMAGE_TOKENS + Math.ceil(textBytes / TEXT_BYTES_PER_TOKEN);
