import { checkAllowance, type Allowance } from './allowance';
import { checkFiles, LIMITS, type DocumentFile, type DocumentKind } from './documents';
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
  PdfInspector,
  TokenSigner,
} from './ports';
import type { ErrorCode } from './results';

export interface ExtractDeps {
  readonly reader: DocumentReader;
  readonly pdf: PdfInspector;
  readonly captcha: CaptchaVerifier;
  readonly signer: TokenSigner;
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
      // The allowance token to keep for the next read.
      readonly allowanceToken: string;
    }
  | { readonly code: ErrorCode };

export interface ExtractMetrics {
  pages?: number;
  inputTokens?: number;
  outputTokens?: number;
  escalated?: boolean;
}

interface Assessment {
  readonly extraction: Extraction;
  readonly failed: readonly CoherenceCheck[];
  readonly mismatch: boolean;
  readonly doubtful: boolean;
  readonly noOutput: boolean;
}

function assess(kind: DocumentKind, read: ModelRead & { outcome: 'read' }): Assessment {
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

export async function extract(
  request: ExtractRequest,
  deps: ExtractDeps,
  metrics: ExtractMetrics,
): Promise<ExtractResponse> {
  const fileProblem = checkFiles(request.files);
  if (fileProblem !== null) return { code: fileProblem };

  let pages = request.files.length;
  const pdf = request.files.find((f) => f.mediaType === 'application/pdf');
  if (pdf) {
    const count = await deps.pdf.countPages(pdf.bytes);
    if (count === null) return { code: 'pdf_unreadable' };
    if (count > LIMITS.maxPdfPages) return { code: 'pdf_too_many_pages' };
    pages = count;
  }
  metrics.pages = pages;

  const allowance = checkAllowance(request.allowance, deps.signer, deps.clock.now());
  if (!allowance.ok) return { code: allowance.code };

  if (!(await deps.captcha.verify(request.captchaToken))) return { code: 'captcha_failed' };

  const readWith = async (model: string): Promise<ModelRead | null> => {
    try {
      const read = await deps.reader.read({ model, kind: request.kind, files: request.files });
      if (read.outcome === 'read') {
        metrics.inputTokens = (metrics.inputTokens ?? 0) + read.inputTokens;
        metrics.outputTokens = (metrics.outputTokens ?? 0) + read.outputTokens;
      }
      return read;
    } catch {
      return null;
    }
  };

  metrics.escalated = false;
  const primary = await readWith(deps.models.primary);
  if (primary === null) return { code: 'model_unavailable' };
  if (primary.outcome === 'rejected') return { code: 'document_unreadable' };

  let result = assess(request.kind, primary);
  // A confident "this is another kind of document" is an answer, not a doubt.
  if (result.doubtful && !result.mismatch && deps.models.escalation !== deps.models.primary) {
    metrics.escalated = true;
    const second = await readWith(deps.models.escalation);
    // The escalation read wins; if it fails, the primary read is still better than nothing.
    if (second?.outcome === 'read') result = assess(request.kind, second);
  }

  if (result.mismatch) return { code: 'document_kind_mismatch' };
  if (result.noOutput) return { code: 'document_unreadable' };

  const { dropped: _dropped, ...extraction } = result.extraction;
  return {
    code: 'ok',
    extraction,
    failedChecks: result.failed,
    allowanceToken: allowance.next(),
  };
}
