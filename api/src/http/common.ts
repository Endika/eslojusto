import { LIMITS } from '../domain/documents';
import type { Clock, Logger, Operation } from '../domain/ports';
import type { ResultCode } from '../domain/results';

// The subset of a Lambda function URL event (payload format 2.0) the handlers read.
export interface HttpEvent {
  readonly body?: string;
  readonly isBase64Encoded: boolean;
  readonly requestContext: { readonly http: { readonly method: string } };
}

export interface HttpResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

const STATUS: Readonly<Record<ResultCode, number>> = {
  ok: 200,
  method_not_allowed: 405,
  invalid_request: 400,
  payload_too_large: 413,
  no_files: 422,
  too_many_files: 422,
  unsupported_media_type: 415,
  image_unreadable: 422,
  image_too_large: 422,
  document_too_dense: 422,
  captcha_failed: 403,
  daily_limit_reached: 429,
  pass_invalid: 403,
  pass_expired: 403,
  pass_exhausted: 429,
  pass_revoked: 403,
  document_unreadable: 422,
  model_unavailable: 503,
  session_not_found: 404,
  session_mismatch: 403,
  payment_not_complete: 402,
  price_mismatch: 422,
  payment_provider_unavailable: 503,
  service_unavailable: 503,
};

export type Outcome = { readonly code: ResultCode } & Readonly<Record<string, unknown>>;

export interface Metrics {
  pages?: number;
  inputTokens?: number;
  outputTokens?: number;
  escalated?: boolean;
  conflicts?: number;
  underestimated?: boolean;
  countNotSaved?: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readJson(event: HttpEvent): Record<string, unknown> | ResultCode {
  if (event.requestContext.http.method !== 'POST') return 'method_not_allowed';
  const raw = event.body ?? '';
  if (raw.length > LIMITS.maxPayloadBytes) return 'payload_too_large';
  try {
    const parsed: unknown = JSON.parse(
      event.isBase64Encoded ? Buffer.from(raw, 'base64').toString('utf8') : raw,
    );
    return isRecord(parsed) ? parsed : 'invalid_request';
  } catch {
    return 'invalid_request';
  }
}

// Parses the body, runs the operation and logs one line with nothing but codes and counts.
export async function handle(
  op: Operation,
  event: HttpEvent,
  deps: { readonly logger: Logger; readonly clock: Clock },
  run: (body: Record<string, unknown>, metrics: Metrics) => Promise<Outcome>,
): Promise<HttpResponse> {
  const started = deps.clock.now();
  const metrics: Metrics = {};
  let outcome: Outcome;
  try {
    const body = readJson(event);
    outcome = typeof body === 'string' ? { code: body } : await run(body, metrics);
  } catch {
    outcome = { code: 'service_unavailable' };
  }
  deps.logger.log({ op, code: outcome.code, latencyMs: deps.clock.now() - started, ...metrics });
  return {
    statusCode: STATUS[outcome.code],
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    body: JSON.stringify(outcome),
  };
}
