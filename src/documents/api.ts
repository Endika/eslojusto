import {
  API_ERROR_CODES,
  COHERENCE_CHECKS,
  RENTAL_CHECKS,
  CONFIDENCES,
  LIMITS,
  PAGE_KINDS,
  READABILITY,
  type Api,
  type FailedCheck,
  type Conflict,
  type ErrorCode,
  type ExtractedRow,
  type Extraction,
  type ExtractionShape,
  type Failure,
  type ReadPage,
  type RecognisedDocument,
  type SourceKind,
  type SourcedField,
} from './contract';
import type { Operation } from './config';

const CHECKS_SET: ReadonlySet<unknown> = new Set([...COHERENCE_CHECKS, ...RENTAL_CHECKS]);

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// Longer than the extract function's 180 s by a minute for the upload, so the browser never
// gives up on a read the API is still able to answer.
export const API_TIMEOUT_MS = 240_000;
// A verify only asks Stripe; past this the page offers to try again.
export const VERIFY_TIMEOUT_MS = 15_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

const isConfidence = (v: unknown) =>
  typeof v === 'string' && (CONFIDENCES as readonly string[]).includes(v);

const isPageKind = (v: unknown): v is RecognisedDocument['kind'] =>
  typeof v === 'string' && (PAGE_KINDS as readonly string[]).includes(v);
const isSource = (v: unknown): v is SourceKind => isPageKind(v) && v !== 'other';
const isOneOf =
  <T extends string>(names: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (names as readonly string[]).includes(v);

function parseField(v: unknown): SourcedField | null {
  if (!isRecord(v) || !isScalar(v['value']) || !isConfidence(v['confidence'])) return null;
  return isSource(v['source']) ? (v as unknown as SourcedField) : null;
}

function parseRow(v: unknown): ExtractedRow | null {
  if (!isRecord(v) || !isConfidence(v['confidence']) || !isRecord(v['values'])) return null;
  if (!Object.values(v['values']).every(isScalar)) return null;
  const row = { values: v['values'], confidence: v['confidence'] } as ExtractedRow;
  return isSource(v['source']) ? { ...row, source: v['source'] } : row;
}

function parseDocument(v: unknown): RecognisedDocument | null {
  if (!isRecord(v) || !isPageKind(v['kind']) || !Array.isArray(v['pages'])) return null;
  const pages = v['pages'].length;
  if (pages === 0) return null;
  const month = v['month'];
  return {
    kind: v['kind'],
    pages,
    ...(typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && { month }),
  };
}

// A page's number, kind and readability; the API sends the readability with its confidence.
function parsePage(v: unknown): ReadPage | null {
  if (!isRecord(v) || !isPageKind(v['kind']) || !isRecord(v['readability'])) return null;
  const { page } = v;
  const readability = v['readability']['value'];
  if (!Number.isInteger(page) || (page as number) < 1 || (page as number) > LIMITS.maxImages)
    return null;
  if (typeof readability !== 'string' || !(READABILITY as readonly string[]).includes(readability))
    return null;
  return {
    page: page as number,
    kind: v['kind'],
    readability: readability as ReadPage['readability'],
  };
}

function parseConflict<F extends string>(
  v: unknown,
  isFieldName: (v: unknown) => v is F,
): Conflict<F> | null {
  if (!isRecord(v) || !isFieldName(v['field']) || !Array.isArray(v['sources'])) return null;
  const sources = v['sources'].filter(isSource);
  return sources.length > 0 ? { field: v['field'], sources } : null;
}

const present = <T>(v: T | null): v is T => v !== null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Keeps what has the contract's shape for the review; anything else in the answer is left out,
// never guessed at.
export function parseExtraction<F extends string, L extends string>(
  v: unknown,
  shape: ExtractionShape<F, L>,
): Extraction<F, L> | null {
  if (!isRecord(v) || !isRecord(v['fields'])) return null;
  const isFieldName = isOneOf(shape.fields);
  const fields: Partial<Record<F, SourcedField>> = {};
  for (const [name, raw] of Object.entries(v['fields'])) {
    const field = parseField(raw);
    if (field && isFieldName(name)) fields[name] = field;
  }
  const lists = isRecord(v['lists']) ? v['lists'] : {};
  const rows = {} as Record<L, readonly ExtractedRow[]>;
  for (const name of shape.lists) rows[name] = list(lists[name]).map(parseRow).filter(present);
  return {
    pages: list(v['pages']).map(parsePage).filter(present),
    documents: list(v['documents']).map(parseDocument).filter(present),
    fields,
    ...rows,
    conflicts: list(v['conflicts'])
      .map((c) => parseConflict(c, isFieldName))
      .filter(present),
  };
}

const fail = (code: ErrorCode): Failure => ({ ok: false, code });

const isApiError = (v: unknown): v is ErrorCode =>
  typeof v === 'string' && (API_ERROR_CODES as readonly string[]).includes(v);

const isToken = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

// One HTTP client per function URL, for one review's page; every failure becomes a code the page
// can word. The final pay's requests carry no review, as they did before there was another.
export function createApi<F extends string, L extends string>(
  endpoints: Readonly<Record<Operation, string>>,
  fetchFn: Fetch,
  shape: ExtractionShape<F, L>,
  timeoutMs = API_TIMEOUT_MS,
): Api<F, L> {
  const review = shape.review === 'final_pay' ? {} : { review: shape.review };
  async function post(
    op: Operation,
    body: object,
    timeout = timeoutMs,
  ): Promise<Record<string, unknown> | Failure> {
    let response: Response;
    try {
      response = await fetchFn(endpoints[op], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(timeout),
      });
    } catch {
      return fail('network_error');
    }
    // Throttling (429) and failures in front of the function (5xx) may come without a code.
    const withoutCode = (): Failure =>
      fail(
        response.status === 413
          ? 'payload_too_large'
          : response.status === 429 || response.status >= 500
            ? 'service_unavailable'
            : 'unexpected_response',
      );
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return withoutCode();
    }
    if (!isRecord(json)) return withoutCode();
    if (json['code'] === 'ok' || json['code'] === 'nothing_read') return json;
    return isApiError(json['code']) ? fail(json['code']) : withoutCode();
  }
  const failed = (r: Record<string, unknown> | Failure): r is Failure => r['ok'] === false;

  return {
    async extract({ files, captchaToken, pass, quota }) {
      const r = await post('extract', {
        files,
        captchaToken,
        ...review,
        ...(pass === undefined ? { quota: quota ?? null } : { pass }),
      });
      if (failed(r)) return r;
      if (r['code'] === 'nothing_read')
        return {
          ok: false,
          code: 'nothing_read',
          pages: list(r['pages']).map(parsePage).filter(present),
        };
      const extraction = parseExtraction(r['extraction'], shape);
      const checks = Array.isArray(r['failedChecks']) ? r['failedChecks'] : [];
      const allowance = isToken(r['allowance']) ? r['allowance'] : null;
      const readsLeft = isCount(r['readsLeft']) ? r['readsLeft'] : null;
      // A free read must hand back its quota token; a pass read, what the pass has left.
      if (!extraction || (pass === undefined ? allowance === null : readsLeft === null))
        return fail('unexpected_response');
      return {
        ok: true,
        extraction,
        failedChecks: checks.filter((c): c is FailedCheck => CHECKS_SET.has(c)),
        allowance,
        readsLeft,
        escalated: typeof r['escalated'] === 'boolean' ? r['escalated'] : null,
      };
    },
    async checkout(nonce, captchaToken) {
      const r = await post('checkout', {
        nonce,
        captchaToken,
        ...(shape.review === 'final_pay' ? {} : { returnTo: shape.review }),
      });
      if (failed(r)) return r;
      const { sessionId, url } = r;
      if (!isToken(sessionId) || !isToken(url)) return fail('unexpected_response');
      return { ok: true, sessionId, url };
    },
    async pass(sessionId, nonce) {
      const r = await post('pass', { sessionId, nonce });
      if (failed(r)) return r;
      const { pass, expiresAt, readsLeft } = r;
      if (!isToken(pass) || !isCount(expiresAt) || !isCount(readsLeft))
        return fail('unexpected_response');
      return { ok: true, pass, expiresAt, readsLeft };
    },
    async verify(pass) {
      const r = await post('pass', { pass }, Math.min(timeoutMs, VERIFY_TIMEOUT_MS));
      if (failed(r)) return r;
      const { expiresAt, readsLeft } = r;
      if (!isCount(expiresAt) || !isCount(readsLeft)) return fail('unexpected_response');
      return { ok: true, expiresAt, readsLeft };
    },
  };
}
