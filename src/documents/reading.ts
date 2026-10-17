import {
  LIMITS,
  LOCATE_LIMITS,
  type Api,
  type ErrorCode,
  type ExtractResult,
  type PassApi,
  type ReadPage,
} from './contract';
import { cannotFit, photoShare, requestBytes } from './files';
import { passClaims, passState, type PassStore, type StoredPass } from './pass';
import { qualityProblem } from './quality';
import type { Captcha, EncodedFile, FileEncoder, OpenedPdf } from './ports';

// How often, at most, preparing the files says how far it got.
const PROGRESS_MS = 500;

// What a read works with. `current` turns false once the person left for the form: what arrives
// late is let go, and nothing further is asked for.
export interface ReadingDeps<F extends string, L extends string> {
  readonly api: Api<F, L>;
  readonly captcha: Captcha;
  readonly encoder: FileEncoder;
  readonly passes: PassStore;
  readonly now: () => number;
  readonly current: () => boolean;
  // How far drawing the pages got: `k` of `total`.
  readonly progress: (kind: 'preparing' | 'locating', k: number, total: number) => void;
}

// A page to send: a photo, or one page of a PDF.
interface Page {
  readonly file: File;
  readonly pdf?: { readonly opened: OpenedPdf; readonly page: number };
}

type Stopped = { readonly kind: 'stopped' };
type CaptchaUnavailable = { readonly kind: 'captcha_unavailable' };
// `renewed` when the refused pass was fetched again and the next read can carry the new one.
type Refused = { readonly kind: 'refused'; readonly code: ErrorCode; readonly renewed: boolean };
const STOPPED: Stopped = { kind: 'stopped' };
const CAPTCHA_UNAVAILABLE: CaptchaUnavailable = { kind: 'captcha_unavailable' };

type Encoded =
  | { readonly kind: 'encoded'; readonly files: readonly EncodedFile[] }
  | { readonly kind: 'too_slow'; readonly pdf: OpenedPdf }
  | { readonly kind: 'failed'; readonly code: 'image_unreadable' | 'payload_too_large' }
  | Stopped;

type Located =
  | { readonly kind: 'chosen' | 'first'; readonly pages: readonly number[] }
  | Refused
  | CaptchaUnavailable
  | Stopped;

type ReadOutcome<F extends string, L extends string> =
  | { readonly kind: 'read'; readonly result: Extract<ExtractResult<F, L>, { ok: true }> }
  | { readonly kind: 'nothing_read'; readonly pages: readonly ReadPage[] }
  | Refused
  | CaptchaUnavailable
  | Stopped;

// What the locate step answers as the read would: the read is refused too, so nothing is cut.
export const REFUSALS: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'invalid_request',
  'captcha_failed',
  'daily_limit_reached',
  'pass_invalid',
  'pass_expired',
  'pass_exhausted',
  'pass_revoked',
  'pass_unconfirmed',
  'payment_not_complete',
  'payment_provider_unavailable',
]);

// Whether a PDF that does not fit can still go whole, its useful pages located when it is read:
// one such PDF at a time, of at most LOCATE_LIMITS.maxPages, with a place left for it.
export const canLocate = (
  api: Pick<Api, 'locate'>,
  pages: number,
  free: number,
  chosen: readonly { readonly long?: unknown }[],
) =>
  api.locate !== undefined &&
  free > 0 &&
  pages > free &&
  pages <= LOCATE_LIMITS.maxPages &&
  !chosen.some((p) => p.long);

// The allowance a request carries: a valid pass, or the free quota.
export function allowanceFor(passes: PassStore, nowMs: number) {
  const stored = passes.pass();
  return stored !== null && passState(stored, nowMs) === 'valid'
    ? { stored, fields: { pass: stored.token } }
    : { stored: null, fields: { quota: passes.quota() } };
}

// A paid pass the API refuses (its signing key may have changed) is asked for once more with
// the payment it came from; true when that gave a different one. Only once per pass.
async function fetchPassAgain(refused: StoredPass, api: PassApi, passes: PassStore) {
  if (refused.renewed) return false;
  const claims = passClaims(refused.token);
  const checkout = passes.checkouts().find((c) => c.redeemed && c.sessionId === claims?.sessionId);
  if (!checkout) return false;
  const again = await api.pass(checkout.sessionId, checkout.nonce);
  // The same token back would only be refused again.
  if (!again.ok || again.pass === refused.token) return false;
  passes.savePass({
    token: again.pass,
    expiresAt: again.expiresAt,
    readsLeft: again.readsLeft,
    renewed: true,
  });
  passes.markRedeemed(checkout.sessionId, again.expiresAt);
  return true;
}

// The server has the last word on what was sent: a pass it no longer honours is dropped, so the
// next read is a free one, and so is a quota token it refuses.
export async function settleRefusal(
  code: ErrorCode,
  stored: StoredPass | null,
  { api, passes }: { readonly api: PassApi; readonly passes: PassStore },
): Promise<'renewed' | 'failed'> {
  if (stored !== null && code === 'pass_exhausted') passes.updateReads(0);
  if (stored !== null && code === 'pass_invalid') {
    if (await fetchPassAgain(stored, api, passes)) return 'renewed';
    passes.retirePass();
  }
  if (stored !== null && ['pass_revoked', 'pass_expired'].includes(code)) passes.forgetPass();
  if (stored === null && code === 'invalid_request' && passes.quota() !== null)
    passes.forgetQuota();
  return 'failed';
}

async function refusal<F extends string, L extends string>(
  code: ErrorCode,
  stored: StoredPass | null,
  deps: ReadingDeps<F, L>,
): Promise<Refused> {
  return {
    kind: 'refused',
    code,
    renewed: (await settleRefusal(code, stored, deps)) === 'renewed',
  };
}

async function captchaToken<F extends string, L extends string>(deps: ReadingDeps<F, L>) {
  try {
    return await deps.captcha.token();
  } catch {
    return deps.current() ? CAPTCHA_UNAVAILABLE : STOPPED;
  }
}

// Calls `progress` at most every PROGRESS_MS.
function throttled<F extends string, L extends string>(
  deps: ReadingDeps<F, L>,
  kind: 'preparing' | 'locating',
) {
  let said = -Infinity;
  return (k: number, total: number) => {
    if (deps.now() - said < PROGRESS_MS) return;
    said = deps.now();
    deps.progress(kind, k, total);
  };
}

// Encodes the pages in their order, sharing what the request may weigh among them. A PDF's pages
// are kept once drawn, and the PDF closed, so a second try needs no reader. Gives up as soon
// as the rest can't fit.
export async function encodeAll<P extends Page, F extends string, L extends string>(
  pages: readonly P[],
  kept: Map<P, EncodedFile>,
  deps: ReadingDeps<F, L>,
): Promise<Encoded> {
  const encoded: EncodedFile[] = [];
  const progress = throttled(deps, 'preparing');
  try {
    for (const [i, p] of pages.entries()) {
      progress(i + 1, pages.length);
      const share = photoShare(requestBytes(encoded), pages.length - i);
      const image =
        kept.get(p) ??
        (await (p.pdf
          ? p.pdf.opened.render(p.pdf.page, share)
          : deps.encoder.encode(p.file, share)));
      if (!deps.current()) return STOPPED;
      if (image === 'pdf_too_slow')
        return p.pdf ? { kind: 'too_slow', pdf: p.pdf.opened } : STOPPED;
      if (p.pdf) kept.set(p, image);
      encoded.push(image);
      if (cannotFit(requestBytes(encoded), pages.length - i - 1, image.bytes))
        return { kind: 'failed', code: 'payload_too_large' };
    }
    for (const opened of new Set(pages.flatMap((p) => (p.pdf ? [p.pdf.opened] : []))))
      opened.close();
  } catch {
    return deps.current() ? { kind: 'failed', code: 'image_unreadable' } : STOPPED;
  }
  return requestBytes(encoded) > LIMITS.requestBudgetBytes
    ? { kind: 'failed', code: 'payload_too_large' }
    : { kind: 'encoded', files: encoded };
}

// The photos that look like they will read badly, each with the one thing to say about it.
export function qualityWarnings<P>(pages: readonly P[], encoded: readonly EncodedFile[]) {
  return pages.flatMap((page, i) => {
    const quality = encoded[i]?.quality;
    const problem = quality ? qualityProblem(quality) : null;
    return problem ? [{ page, problem }] : [];
  });
}

// Every page of the long PDF, at low resolution, within the request's budget; null when one
// can't be drawn in time or the whole doesn't fit.
async function lowResolution<F extends string, L extends string>(
  opened: OpenedPdf,
  deps: ReadingDeps<F, L>,
) {
  const encoded: EncodedFile[] = [];
  const progress = throttled(deps, 'locating');
  for (let page = 1; page <= opened.pages; page += 1) {
    progress(page, opened.pages);
    const share = photoShare(requestBytes(encoded), opened.pages - page + 1);
    let image: EncodedFile | 'pdf_too_slow';
    try {
      image = await opened.render(page, share, LOCATE_LIMITS.imageLongSide);
    } catch {
      return null;
    }
    if (!deps.current() || image === 'pdf_too_slow') return null;
    encoded.push(image);
  }
  return requestBytes(encoded) > LIMITS.requestBudgetBytes ? null : encoded;
}

const sent = (files: readonly EncodedFile[]) =>
  files.map(({ mediaType, data }) => ({ mediaType, data }));

// The pages of a long PDF the read should take, at most `room`: the ones the locate step chose
// or, if it could not choose, the first ones. `sending` runs as the request leaves.
export async function locatePages<F extends string, L extends string>(
  opened: OpenedPdf,
  room: number,
  deps: ReadingDeps<F, L>,
  sending: () => void,
): Promise<Located> {
  const first = { kind: 'first', pages: Array.from({ length: room }, (_, i) => i + 1) } as const;
  if (!deps.api.locate) return first;
  const files = await lowResolution(opened, deps);
  if (!deps.current()) return STOPPED;
  if (files === null) return first;
  const token = await captchaToken(deps);
  if (typeof token !== 'string') return token;
  if (!deps.current()) return STOPPED;
  sending();
  const { stored, fields } = allowanceFor(deps.passes, deps.now());
  const result = await deps.api.locate({
    files: sent(files),
    captchaToken: token,
    maxPages: room,
    ...fields,
  });
  if (!deps.current()) return STOPPED;
  if (!result.ok && REFUSALS.has(result.code)) return refusal(result.code, stored, deps);
  return result.ok ? { kind: 'chosen', pages: result.pages } : first;
}

// Sends the pages with the allowance they carry and keeps what the answer says is left: the
// quota token after a free read, the reads left after a pass read; one that found nothing spent
// nothing. `sending` runs as the request leaves.
export async function sendRead<F extends string, L extends string>(
  files: readonly EncodedFile[],
  deps: ReadingDeps<F, L>,
  sending: () => void,
): Promise<ReadOutcome<F, L>> {
  const token = await captchaToken(deps);
  if (typeof token !== 'string') return token;
  if (!deps.current()) return STOPPED;
  const { stored, fields } = allowanceFor(deps.passes, deps.now());
  sending();
  const result = await deps.api.extract({ files: sent(files), captchaToken: token, ...fields });
  if (!result.ok && result.code === 'nothing_read')
    return { kind: 'nothing_read', pages: result.pages };
  if (!result.ok) return refusal(result.code, stored, deps);
  if (stored !== null && result.readsLeft !== null) deps.passes.updateReads(result.readsLeft);
  if (stored === null && result.allowance !== null) deps.passes.saveQuota(result.allowance);
  return { kind: 'read', result };
}
