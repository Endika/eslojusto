import {
  checkAllowance,
  PASS_READS,
  passSessionProblem,
  readsLeft,
  type Allowance,
} from './allowance';
import { checkFileShapes, imageSizes, type DocumentFile } from './documents';
import {
  failedChecks,
  hasLowConfidence,
  parseReading,
  type CoherenceCheck,
  type Reading,
} from './extraction';
import { ITEM_IDS } from './extraction-schema';
import { merge, type Merged } from './merge';
import type {
  CaptchaVerifier,
  Clock,
  DocumentReader,
  ModelRead,
  PaymentVerifier,
  TokenSigner,
} from './ports';
import type { ErrorCode } from './results';
import {
  imageTokens,
  MAX_ESCALATION_INPUT_TOKENS,
  MAX_ESTIMATED_INPUT_TOKENS,
  PROMPT_TOKENS,
  UNDERESTIMATE_FACTOR,
} from './tokens';

// Every model read, retries included, is abandoned this long after the request started, which
// leaves the function's 180 s room to count a pass read and answer.
export const READ_DEADLINE_MS = 160_000;
// A second read starts only this early: it can take as long as the first.
export const NO_ESCALATION_AFTER_MS = 90_000;

export interface ExtractDeps {
  readonly reader: DocumentReader;
  readonly captcha: CaptchaVerifier;
  readonly signer: TokenSigner;
  readonly payments: PaymentVerifier;
  readonly clock: Clock;
  readonly models: { readonly primary: string; readonly escalation: string };
}

export interface ExtractRequest {
  readonly files: readonly DocumentFile[];
  readonly captchaToken: string;
  readonly allowance: Allowance;
}

export type ExtractResponse =
  | {
      readonly code: 'ok';
      readonly extraction: Omit<Merged, 'discarded'>;
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
  conflicts?: number;
  underestimated?: boolean;
  countNotSaved?: boolean;
}

interface Assessment {
  readonly extraction: Merged;
  readonly failed: readonly CoherenceCheck[];
  readonly doubtful: boolean;
  readonly noOutput: boolean;
}

// What a pack about the end of a job should have yielded and did not: worth a second look.
function incomplete(reading: Reading, extraction: Merged): boolean {
  const kinds = new Set(reading.pages.map((p) => p.kind));
  const final = reading.sections.final_payslip;
  const salaryLines = (final?.lists['lines'] ?? []).some((l) => l.values['category'] === 'salary');
  const figures = ITEM_IDS.some((id) => extraction.fields[id] !== undefined);
  if ((kinds.has('dismissal_letter') || final) && !figures && !salaryLines) return true;
  const monthly = reading.sections.monthly_payslip;
  if ((monthly?.lists['lines'] ?? []).length > 0 && !monthly?.fields['extraPayProrated'])
    return true;
  // A page set aside is worth a second look only when the pack lacks what a dismissal brings
  // with it: a letter but no settlement and no final payslip. An IRPF certificate alone is not.
  const missing = kinds.has('dismissal_letter') && !kinds.has('settlement_proposal') && !final;
  return kinds.has('other') && missing;
}

function assess(read: ModelRead, pageCount: number): Assessment {
  const reading = parseReading(read.toolInput, pageCount);
  const extraction = merge(reading);
  const { startDate, endDate } = extraction.fields;
  const failed = [...failedChecks(reading)];
  // Two documents can each be coherent and still put the end before the start between them.
  if (
    typeof startDate?.value === 'string' &&
    typeof endDate?.value === 'string' &&
    endDate.value < startDate.value &&
    !failed.includes('end_before_start')
  )
    failed.push('end_before_start');
  const noOutput = read.toolInput === null;
  const doubtful =
    noOutput ||
    reading.unclassified > 0 ||
    reading.dropped > 0 ||
    failed.length > 0 ||
    hasLowConfidence(reading) ||
    extraction.discarded > 0 ||
    incomplete(reading, extraction);
  return { extraction, failed, doubtful, noOutput };
}

// Estimated input tokens, or why the images can't be read at a bounded cost. Images are priced
// by their pixels, so the estimate is a bound, not a guess.
function measure(files: readonly DocumentFile[]): number | ErrorCode {
  const sizes = imageSizes(files);
  if (typeof sizes === 'string') return sizes;
  const tokens = PROMPT_TOKENS + sizes.reduce((sum, size) => sum + imageTokens(size), 0);
  return tokens > MAX_ESTIMATED_INPUT_TOKENS ? 'document_too_dense' : tokens;
}

export async function extract(
  request: ExtractRequest,
  deps: ExtractDeps,
  metrics: ExtractMetrics,
): Promise<ExtractResponse> {
  const started = deps.clock.now();
  const deadline = started + READ_DEADLINE_MS;
  const shapeProblem = checkFileShapes(request.files);
  if (shapeProblem !== null) return { code: shapeProblem };

  const allowance = checkAllowance(request.allowance, deps.signer, deps.clock.now());
  if (!allowance.ok) return { code: allowance.code };

  // Before anything that parses what the person sent.
  if (!(await deps.captcha.verify(request.captchaToken))) return { code: 'captcha_failed' };

  const estimate = measure(request.files);
  if (typeof estimate === 'string') return { code: estimate };
  const pageCount = request.files.length;
  metrics.pages = pageCount;

  let passSession = null;
  if (allowance.type === 'pass') {
    try {
      passSession = await deps.payments.findSession(allowance.sessionId);
    } catch {
      return { code: 'payment_provider_unavailable' };
    }
    // Signed by this API and unexpired: a session Stripe can't find is its problem, not the pass's.
    if (passSession === null) return { code: 'pass_unconfirmed' };
    const problem = passSessionProblem(passSession, deps.clock.now());
    if (problem !== null) return { code: problem };
    if (readsLeft(passSession) === 0) return { code: 'pass_exhausted' };
  }

  const readWith = async (model: string): Promise<ModelRead | null> => {
    try {
      const read = await deps.reader.read({
        model,
        files: request.files,
        deadline,
      });
      metrics.inputTokens = (metrics.inputTokens ?? 0) + read.inputTokens;
      metrics.outputTokens = (metrics.outputTokens ?? 0) + read.outputTokens;
      return read;
    } catch {
      return null;
    }
  };

  const { primary: primaryModel, escalation: escalationModel } = deps.models;
  const canEscalate = (inputTokens: number): boolean =>
    escalationModel !== primaryModel &&
    inputTokens <= MAX_ESCALATION_INPUT_TOKENS &&
    deps.clock.now() - started < NO_ESCALATION_AFTER_MS;

  metrics.escalated = false;
  let result: Assessment | null = null;
  const primary = await readWith(primaryModel);
  if (primary !== null) result = assess(primary, pageCount);
  if (primary !== null && primary.inputTokens > UNDERESTIMATE_FACTOR * estimate)
    metrics.underestimated = true;

  // A failed primary (model retired, not enabled, throttled) or a doubtful read goes to the
  // escalation model, unless the pack is too big to be worth a dearer second read.
  const doubt = result === null || result.doubtful;
  if (doubt && canEscalate(primary?.inputTokens ?? estimate)) {
    metrics.escalated = true;
    const second = await readWith(escalationModel);
    const assessed = second === null ? null : assess(second, pageCount);
    // The escalation read wins only if it has something to say.
    if (assessed !== null && (!assessed.noOutput || result === null)) result = assessed;
  }

  if (result === null) return { code: 'model_unavailable' };
  if (result.noOutput) return { code: 'document_unreadable' };

  // A count, never which values: the log carries nothing a document said.
  metrics.conflicts = result.extraction.conflicts.length;
  const { discarded: _discarded, ...extraction } = result.extraction;
  const ok = { code: 'ok' as const, extraction, failedChecks: result.failed };
  if (allowance.type === 'free') return { ...ok, allowanceToken: allowance.next() };

  // Counted only now, with the answer ready: a read that failed or ran out of time costs nothing.
  // If the browser has given up by now (it waits 60 s longer than the function), the read is
  // counted all the same; the person sees an error and the pass shows one read fewer.
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
