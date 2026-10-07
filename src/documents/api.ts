import {
  API_ERROR_CODES,
  COHERENCE_CHECKS,
  CONFIDENCES,
  EXTRACTED_FIELDS,
  PAGE_KINDS,
  type Api,
  type CoherenceCheck,
  type Conflict,
  type ErrorCode,
  type ExtractedFieldName,
  type ExtractedRow,
  type Extraction,
  type Failure,
  type RecognisedDocument,
  type SourceKind,
  type SourcedField,
} from './contract';
import type { Operation } from './config';

const CHECKS_SET: ReadonlySet<unknown> = new Set(COHERENCE_CHECKS);

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

// Longer than the extract function's 180 s by a minute for the upload, so the browser never
// gives up on a read the API is still able to answer.
export const API_TIMEOUT_MS = 240_000;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

const isConfidence = (v: unknown) =>
  typeof v === 'string' && (CONFIDENCES as readonly string[]).includes(v);

const isPageKind = (v: unknown): v is RecognisedDocument['kind'] =>
  typeof v === 'string' && (PAGE_KINDS as readonly string[]).includes(v);
const isSource = (v: unknown): v is SourceKind => isPageKind(v) && v !== 'other';
const isFieldName = (v: unknown): v is ExtractedFieldName =>
  typeof v === 'string' && (EXTRACTED_FIELDS as readonly string[]).includes(v);

function parseField(v: unknown): SourcedField | null {
  if (!isRecord(v) || !isScalar(v['value']) || !isConfidence(v['confidence'])) return null;
  return isSource(v['source']) ? (v as unknown as SourcedField) : null;
}

function parseRow(v: unknown): ExtractedRow | null {
  if (!isRecord(v) || !isConfidence(v['confidence']) || !isRecord(v['values'])) return null;
  return Object.values(v['values']).every(isScalar) ? (v as unknown as ExtractedRow) : null;
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

function parseConflict(v: unknown): Conflict | null {
  if (!isRecord(v) || !isFieldName(v['field']) || !Array.isArray(v['sources'])) return null;
  const sources = v['sources'].filter(isSource);
  return sources.length > 0 ? { field: v['field'], sources } : null;
}

const present = <T>(v: T | null): v is T => v !== null;
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

// Keeps what has the contract's shape; anything else in the answer is left out, never guessed at.
export function parseExtraction(v: unknown): Extraction | null {
  if (!isRecord(v) || !isRecord(v['fields'])) return null;
  const fields: Partial<Record<ExtractedFieldName, SourcedField>> = {};
  for (const [name, raw] of Object.entries(v['fields'])) {
    const field = parseField(raw);
    if (field && isFieldName(name)) fields[name] = field;
  }
  const lists = isRecord(v['lists']) ? v['lists'] : {};
  return {
    documents: list(v['documents']).map(parseDocument).filter(present),
    fields,
    contracts: list(lists['contracts']).map(parseRow).filter(present),
    conflicts: list(v['conflicts']).map(parseConflict).filter(present),
  };
}

const fail = (code: ErrorCode): Failure => ({ ok: false, code });

const isApiError = (v: unknown): v is ErrorCode =>
  typeof v === 'string' && (API_ERROR_CODES as readonly string[]).includes(v);

const isToken = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

// One HTTP client per function URL; every failure becomes a code the page can word.
export function createApi(
  endpoints: Readonly<Record<Operation, string>>,
  fetchFn: Fetch,
  timeoutMs = API_TIMEOUT_MS,
): Api {
  async function post(op: Operation, body: object): Promise<Record<string, unknown> | Failure> {
    let response: Response;
    try {
      response = await fetchFn(endpoints[op], {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(timeoutMs),
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
    if (json['code'] === 'ok') return json;
    return isApiError(json['code']) ? fail(json['code']) : withoutCode();
  }
  const failed = (r: Record<string, unknown> | Failure): r is Failure => r['ok'] === false;

  return {
    async extract({ files, captchaToken, pass, quota }) {
      const r = await post('extract', {
        files,
        captchaToken,
        ...(pass === undefined ? { quota: quota ?? null } : { pass }),
      });
      if (failed(r)) return r;
      const extraction = parseExtraction(r['extraction']);
      const checks = Array.isArray(r['failedChecks']) ? r['failedChecks'] : [];
      const allowance = isToken(r['allowance']) ? r['allowance'] : null;
      const readsLeft = isCount(r['readsLeft']) ? r['readsLeft'] : null;
      // A free read must hand back its quota token; a pass read, what the pass has left.
      if (!extraction || (pass === undefined ? allowance === null : readsLeft === null))
        return fail('unexpected_response');
      return {
        ok: true,
        extraction,
        failedChecks: checks.filter((c): c is CoherenceCheck => CHECKS_SET.has(c)),
        allowance,
        readsLeft,
        escalated: typeof r['escalated'] === 'boolean' ? r['escalated'] : null,
      };
    },
    async checkout(nonce, captchaToken) {
      const r = await post('checkout', { nonce, captchaToken });
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
  };
}
