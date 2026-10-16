import { checkAllowance, passSessionProblem, readsLeft, type Allowance } from './allowance';
import { checkFileShapes, imageSizes, type DocumentFile } from './documents';
import { errorName, type ErrorName } from './error-name';
import type { CaptchaVerifier, Clock, PageLocator, PaymentVerifier, TokenSigner } from './ports';
import type { ErrorCode } from './results';
import type { ReviewKind } from './reviews';
import { imageTokens } from './tokens';

// The reviews whose documents can run past a read's 25 pages: a mortgage deed has 25 to 60.
export const LOCATE_REVIEWS = ['mortgage'] as const satisfies readonly ReviewKind[];
export type LocateReview = (typeof LOCATE_REVIEWS)[number];

export const isLocateReview = (v: unknown): v is LocateReview =>
  typeof v === 'string' && (LOCATE_REVIEWS as readonly string[]).includes(v);

// Low-resolution page images, enough to tell a clause from a land registry certificate.
export const LOCATE_LIMITS = { maxImages: 80, maxImageLongSide: 1024 } as const;

// The locate prompt and tool, priced at two characters per token (test/locate.test.ts keeps it
// honest).
export const LOCATE_PROMPT_TOKENS = 1_500;
// 80 square pages at 768 px come to 62,960 (A4 ones, 44,800); at this cap a Haiku call costs
// 66,000 × 1.10 + 2,000 × 5.50 USD per million = 0.084 USD (api/README.md, «Cost»).
export const MAX_LOCATE_INPUT_TOKENS = 66_000;
export const LOCATE_MAX_TOKENS = 2_000;
export const LOCATE_DEADLINE_MS = 90_000;
export interface LocateDeps {
  readonly locator: PageLocator;
  readonly captcha: CaptchaVerifier;
  readonly signer: TokenSigner;
  readonly payments: PaymentVerifier;
  readonly clock: Clock;
  readonly model: string;
}

export interface LocateRequest {
  readonly files: readonly DocumentFile[];
  readonly captchaToken: string;
  readonly allowance: Allowance;
  readonly review: LocateReview;
  // The places left in the read that follows.
  readonly maxPages: number;
}

export type LocateResponse =
  | {
      readonly code: 'ok';
      // Page numbers in what was sent, ascending: the most useful, up to maxPages.
      readonly pages: readonly number[];
    }
  | { readonly code: ErrorCode };

export interface LocateMetrics {
  pages?: number;
  inputTokens?: number;
  outputTokens?: number;
  review?: ReviewKind;
  error?: ErrorName;
  step?: 'locate';
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// The pages the model named, most useful first as it listed them, cut to `maxPages` and put back
// in order. Anything it named twice, out of range or not as a whole number is dropped.
export function chosenPages(toolInput: unknown, pageCount: number, maxPages: number): number[] {
  const listed = isRecord(toolInput) && Array.isArray(toolInput['pages']) ? toolInput['pages'] : [];
  const seen = new Set<number>();
  for (const entry of listed) {
    const page = isRecord(entry) ? entry['page'] : undefined;
    if (!Number.isInteger(page)) continue;
    const n = page as number;
    if (n < 1 || n > pageCount || seen.has(n)) continue;
    seen.add(n);
    if (seen.size === maxPages) break;
  }
  return [...seen].sort((a, b) => a - b);
}

// One cheap call over every page of a long upload: which pages the read should take. It spends no
// read, but answers as the read would if none is left, and needs its own captcha, as the read that
// follows does: each costs a fresh challenge.
export async function locate(
  request: LocateRequest,
  deps: LocateDeps,
  metrics: LocateMetrics,
): Promise<LocateResponse> {
  const started = deps.clock.now();
  metrics.step = 'locate';
  metrics.review = request.review;
  const shapeProblem = checkFileShapes(request.files, LOCATE_LIMITS.maxImages);
  if (shapeProblem !== null) return { code: shapeProblem };

  const allowance = checkAllowance(request.allowance, deps.signer, started);
  if (!allowance.ok) return { code: allowance.code };

  if (!(await deps.captcha.verify(request.captchaToken))) return { code: 'captcha_failed' };

  const sizes = imageSizes(request.files, LOCATE_LIMITS.maxImageLongSide);
  if (typeof sizes === 'string') return { code: sizes };
  const estimate = LOCATE_PROMPT_TOKENS + sizes.reduce((sum, size) => sum + imageTokens(size), 0);
  if (estimate > MAX_LOCATE_INPUT_TOKENS) return { code: 'document_too_dense' };
  metrics.pages = request.files.length;

  if (allowance.type === 'pass') {
    let session;
    try {
      session = await deps.payments.findSession(allowance.sessionId);
    } catch (error) {
      metrics.error = errorName(error);
      return { code: 'payment_provider_unavailable' };
    }
    if (session === null) return { code: 'pass_unconfirmed' };
    const problem = passSessionProblem(session, deps.clock.now());
    if (problem !== null) return { code: problem };
    if (readsLeft(session) === 0) return { code: 'pass_exhausted' };
  }

  let read;
  try {
    read = await deps.locator.locate({
      model: deps.model,
      review: request.review,
      files: request.files,
      deadline: started + LOCATE_DEADLINE_MS,
    });
  } catch (error) {
    metrics.error = errorName(error);
    return { code: 'model_unavailable' };
  }
  metrics.inputTokens = read.inputTokens;
  metrics.outputTokens = read.outputTokens;
  const pages = chosenPages(read.toolInput, request.files.length, request.maxPages);
  if (pages.length === 0) return { code: 'document_unreadable' };
  return { code: 'ok', pages };
}
