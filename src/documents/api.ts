import {
  API_ERROR_CODES,
  COHERENCE_CHECKS,
  CONFIDENCES,
  DOCUMENT_KINDS,
  type Api,
  type CoherenceCheck,
  type ErrorCode,
  type ExtractedField,
  type ExtractedRow,
  type Extraction,
  type Failure,
} from './contract';

const CHECKS_SET: ReadonlySet<unknown> = new Set(COHERENCE_CHECKS);

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isScalar = (v: unknown): v is string | number | boolean =>
  typeof v === 'string' || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v));

const isConfidence = (v: unknown) =>
  typeof v === 'string' && (CONFIDENCES as readonly string[]).includes(v);

function parseField(v: unknown): ExtractedField | null {
  if (!isRecord(v) || !isScalar(v['value']) || !isConfidence(v['confidence'])) return null;
  return v as unknown as ExtractedField;
}

function parseRow(v: unknown): ExtractedRow | null {
  if (!isRecord(v) || !isConfidence(v['confidence']) || !isRecord(v['values'])) return null;
  return Object.values(v['values']).every(isScalar) ? (v as unknown as ExtractedRow) : null;
}

// Keeps what has the contract's shape; anything else in the answer is left out, never guessed at.
export function parseExtraction(v: unknown): Extraction | null {
  if (!isRecord(v) || !(DOCUMENT_KINDS as readonly unknown[]).includes(v['kind'])) return null;
  const fields: Record<string, ExtractedField> = {};
  const lists: Record<string, ExtractedRow[]> = {};
  for (const [name, raw] of Object.entries(isRecord(v['fields']) ? v['fields'] : {})) {
    const field = parseField(raw);
    if (field) fields[name] = field;
  }
  for (const [name, raw] of Object.entries(isRecord(v['lists']) ? v['lists'] : {})) {
    if (!Array.isArray(raw)) continue;
    lists[name] = raw.map(parseRow).filter((r): r is ExtractedRow => r !== null);
  }
  return { kind: v['kind'] as Extraction['kind'], fields, lists };
}

const fail = (code: ErrorCode): Failure => ({ ok: false, code });

const isApiError = (v: unknown): v is ErrorCode =>
  typeof v === 'string' && (API_ERROR_CODES as readonly string[]).includes(v);

const isToken = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

// One HTTP client per operation path; every failure becomes a code the page can word.
export function createApi(baseUrl: string, fetchFn: Fetch, timeoutMs = 120_000): Api {
  async function post(path: string, body: object): Promise<Record<string, unknown> | Failure> {
    let response: Response;
    try {
      response = await fetchFn(`${baseUrl}/${path}`, {
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
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return fail(response.status === 413 ? 'payload_too_large' : 'unexpected_response');
    }
    if (!isRecord(json)) return fail('unexpected_response');
    if (json['code'] === 'ok') return json;
    return fail(isApiError(json['code']) ? json['code'] : 'unexpected_response');
  }
  const failed = (r: Record<string, unknown> | Failure): r is Failure => r['ok'] === false;

  return {
    async extract({ kind, files, captchaToken, pass, quota }) {
      const r = await post('extract', {
        kind,
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
