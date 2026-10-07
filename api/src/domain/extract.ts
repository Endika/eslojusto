import {
  checkAllowance,
  PASS_READS,
  passSessionProblem,
  readsLeft,
  type Allowance,
} from './allowance';
import {
  checkFileShapes,
  imageSizes,
  LIMITS,
  type DocumentFile,
  type DocumentKind,
} from './documents';
import {
  failedChecks,
  hasLowConfidence,
  parseExtraction,
  type CoherenceCheck,
  type Extraction,
} from './extraction';
import type {
  CaptchaVerifier,
  Clock,
  DocumentReader,
  ModelRead,
  PaymentVerifier,
  PdfInspector,
  TokenSigner,
} from './ports';
import type { ErrorCode } from './results';
import {
  imageTokens,
  MAX_ESCALATION_INPUT_TOKENS,
  MAX_ESTIMATED_INPUT_TOKENS,
  pdfTokens,
  PROMPT_TOKENS,
  UNDERESTIMATE_FACTOR,
} from './tokens';

export interface ExtractDeps {
  readonly reader: DocumentReader;
  readonly pdf: PdfInspector;
  readonly captcha: CaptchaVerifier;
  readonly signer: TokenSigner;
  readonly payments: PaymentVerifier;
  readonly clock: Clock;
  readonly models: { readonly primary: string; readonly escalation: string };
}

export interface ExtractRequest {
  readonly kind: DocumentKind;
  readonly files: readonly DocumentFile[];
  readonly captchaToken: string;
  readonly allowance: Allowance;
}

export type ExtractResponse =
  | {
      readonly code: 'ok';
      readonly extraction: Omit<Extraction, 'dropped'>;
      readonly failedChecks: readonly CoherenceCheck[];
      // The quota token to keep for the next free read; a pass keeps its own token.
      readonly allowanceToken?: string;
      readonly readsLeft?: number;
    }
  | { readonly code: ErrorCode };

export interface ExtractMetrics {
  pages?: number;
  inputTokens?: number;
  outputTokens?: number;
  escalated?: boolean;
  underestimated?: boolean;
  countNotSaved?: boolean;
}

interface Assessment {
  readonly extraction: Extraction;
  readonly failed: readonly CoherenceCheck[];
  readonly mismatch: boolean;
  readonly doubtful: boolean;
  readonly noOutput: boolean;
}

function assess(kind: DocumentKind, read: ModelRead): Assessment {
  const extraction = parseExtraction(kind, read.toolInput);
  const failed = failedChecks(extraction);
  const detected = extraction.fields['detectedKind'];
  const mismatch =
    detected !== undefined && detected.value !== kind && detected.confidence !== 'low';
  const noOutput = read.toolInput === null;
  const doubtful =
    noOutput ||
    detected === undefined ||
    extraction.dropped > 0 ||
    failed.length > 0 ||
    hasLowConfidence(extraction);
  return { extraction, failed, mismatch, doubtful, noOutput };
}

// Pages and estimated input tokens, or why the files can't be read at a bounded cost.
async function measure(
  files: readonly DocumentFile[],
  pdf: PdfInspector,
): Promise<{ readonly pages: number; readonly tokens: number } | ErrorCode> {
  const sizes = imageSizes(files);
  if (typeof sizes === 'string') return sizes;
  let pages = sizes.length;
  let tokens = PROMPT_TOKENS + sizes.reduce((sum, size) => sum + imageTokens(size), 0);
  const document = files.find((f) => f.mediaType === 'application/pdf');
  if (document) {
    const facts = await pdf.inspect(document.bytes);
    if (facts === null) return 'pdf_unreadable';
    if (facts.pages > LIMITS.maxPdfPages) return 'pdf_too_many_pages';
    pages = facts.pages;
    tokens += pdfTokens(facts.pages, facts.textBytes);
  }
  return tokens > MAX_ESTIMATED_INPUT_TOKENS ? 'document_too_dense' : { pages, tokens };
}

export async function extract(
  request: ExtractRequest,
  deps: ExtractDeps,
  metrics: ExtractMetrics,
): Promise<ExtractResponse> {
  const shapeProblem = checkFileShapes(request.files);
  if (shapeProblem !== null) return { code: shapeProblem };

  const allowance = checkAllowance(request.allowance, deps.signer, deps.clock.now());
  if (!allowance.ok) return { code: allowance.code };

  // Before anything that parses what the person sent.
  if (!(await deps.captcha.verify(request.captchaToken))) return { code: 'captcha_failed' };

  const measured = await measure(request.files, deps.pdf);
  if (typeof measured === 'string') return { code: measured };
  metrics.pages = measured.pages;

  let passSession = null;
  if (allowance.type === 'pass') {
    try {
      passSession = await deps.payments.findSession(allowance.sessionId);
    } catch {
      return { code: 'payment_provider_unavailable' };
    }
    if (passSession === null) return { code: 'pass_invalid' };
    const problem = passSessionProblem(passSession, deps.clock.now());
    if (problem !== null) return { code: problem };
    if (readsLeft(passSession) === 0) return { code: 'pass_exhausted' };
  }

  const readWith = async (model: string): Promise<ModelRead | null> => {
    try {
      const read = await deps.reader.read({ model, kind: request.kind, files: request.files });
      metrics.inputTokens = (metrics.inputTokens ?? 0) + read.inputTokens;
      metrics.outputTokens = (metrics.outputTokens ?? 0) + read.outputTokens;
      return read;
    } catch {
      return null;
    }
  };

  const { primary: primaryModel, escalation: escalationModel } = deps.models;
  const canEscalate = (inputTokens: number): boolean =>
    escalationModel !== primaryModel && inputTokens <= MAX_ESCALATION_INPUT_TOKENS;

  metrics.escalated = false;
  let result: Assessment | null = null;
  const primary = await readWith(primaryModel);
  if (primary !== null) result = assess(request.kind, primary);
  if (primary !== null && primary.inputTokens > UNDERESTIMATE_FACTOR * measured.tokens)
    metrics.underestimated = true;

  // A failed primary (model retired, not enabled, throttled) or a doubtful read goes to the
  // escalation model, unless the document is too big to be worth a dearer second read. A
  // confident "this is another kind of document" is an answer, not a doubt.
  const doubt = result === null || (result.doubtful && !result.mismatch);
  if (doubt && canEscalate(primary?.inputTokens ?? measured.tokens)) {
    metrics.escalated = true;
    const second = await readWith(escalationModel);
    const assessed = second === null ? null : assess(request.kind, second);
    // The escalation read wins only if it has something to say.
    if (assessed !== null && (!assessed.noOutput || result === null)) result = assessed;
  }

  if (result === null) return { code: 'model_unavailable' };
  if (result.mismatch) return { code: 'document_kind_mismatch' };
  if (result.noOutput) return { code: 'document_unreadable' };

  const { dropped: _dropped, ...extraction } = result.extraction;
  const ok = { code: 'ok' as const, extraction, failedChecks: result.failed };
  if (allowance.type === 'free') return { ...ok, allowanceToken: allowance.next() };

  // Read-modify-write on Stripe: two reads racing on one pass can both count as one.
  const used = (passSession?.readsUsed ?? 0) + 1;
  try {
    await deps.payments.recordReads(allowance.sessionId, used);
  } catch {
    // The person got their read; a counter Stripe failed to store errs in their favour.
    metrics.countNotSaved = true;
  }
  return { ...ok, readsLeft: Math.max(0, PASS_READS - used) };
}
