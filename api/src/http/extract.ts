import type { Allowance } from '../domain/allowance';
import { LIMITS, MEDIA_TYPES, type DocumentFile, type MediaType } from '../domain/documents';
import { extract, type ExtractDeps, type ExtractRequest } from '../domain/extract';
import {
  isLocateReview,
  LOCATE_LIMITS,
  locate,
  type LocateDeps,
  type LocateRequest,
} from '../domain/locate';
import type { Clock, Logger, PageLocator } from '../domain/ports';
import type { ErrorCode } from '../domain/results';
import { isReview, type ReviewKind } from '../domain/reviews';
import { handle, type HttpEvent, type HttpResponse } from './common';

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
const MAX_TOKEN_LENGTH = 2048;

const isMediaType = (v: unknown): v is MediaType =>
  typeof v === 'string' && (MEDIA_TYPES as readonly string[]).includes(v);
const isToken = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= MAX_TOKEN_LENGTH;

function toRequest(
  body: Record<string, unknown>,
  maxImages: number,
): ExtractRequest<ReviewKind> | ErrorCode {
  const { files, captchaToken, pass, quota, review } = body;
  if (!Array.isArray(files) || !isToken(captchaToken)) return 'invalid_request';
  if (review !== undefined && !isReview(review)) return 'invalid_request';
  if (files.length > maxImages) return 'too_many_files';

  let allowance: Allowance;
  if (pass !== undefined) {
    if (!isToken(pass)) return 'invalid_request';
    allowance = { type: 'pass', token: pass };
  } else {
    if (quota !== undefined && quota !== null && !isToken(quota)) return 'invalid_request';
    allowance = { type: 'free', token: isToken(quota) ? quota : null };
  }

  const decoded: DocumentFile[] = [];
  for (const file of files as unknown[]) {
    if (typeof file !== 'object' || file === null) return 'invalid_request';
    const { mediaType, data } = file as Record<string, unknown>;
    if (!isMediaType(mediaType)) return 'unsupported_media_type';
    if (typeof data !== 'string' || data.length % 4 !== 0 || !BASE64.test(data))
      return 'invalid_request';
    decoded.push({ mediaType, bytes: new Uint8Array(Buffer.from(data, 'base64')) });
  }
  return { files: decoded, captchaToken, allowance, ...(review !== undefined && { review }) };
}

function toLocateRequest(body: Record<string, unknown>): LocateRequest | ErrorCode {
  const { review, maxPages } = body;
  if (!isLocateReview(review)) return 'invalid_request';
  if (!Number.isInteger(maxPages) || (maxPages as number) < 1) return 'invalid_request';
  if ((maxPages as number) > LIMITS.maxImages) return 'invalid_request';
  const request = toRequest(body, LOCATE_LIMITS.maxImages);
  if (typeof request === 'string') return request;
  return { ...request, review, maxPages: maxPages as number };
}

export function handleExtract(
  event: HttpEvent,
  deps: ExtractDeps & {
    readonly logger: Logger;
    readonly clock: Clock;
    readonly locate: { readonly locator: PageLocator; readonly model: string };
  },
): Promise<HttpResponse> {
  return handle('extract', event, deps, async (body, metrics) => {
    if (body['step'] === 'locate') {
      metrics.step = 'locate';
      const request = toLocateRequest(body);
      if (typeof request === 'string') return { code: request };
      const locateDeps: LocateDeps = { ...deps, ...deps.locate };
      return locate(request, locateDeps, metrics);
    }
    if (body['step'] !== undefined) return { code: 'invalid_request' };
    const request = toRequest(body, LIMITS.maxImages);
    if (typeof request === 'string') return { code: request };
    const response = await extract(request, deps, metrics);
    if (response.code !== 'ok') return response;
    return {
      code: 'ok',
      extraction: response.extraction,
      failedChecks: response.failedChecks,
      escalated: metrics.escalated ?? false,
      ...(response.allowanceToken !== undefined && { allowance: response.allowanceToken }),
      ...(response.readsLeft !== undefined && { readsLeft: response.readsLeft }),
    };
  });
}
