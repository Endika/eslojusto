import type { CompletedReview } from '../calculator/ports';
import { required } from '../calculator/dom';
import type { Review } from '../engine/review';
import type { Translate } from '../i18n/client';
import { SESSION_ID, type Api, type ErrorCode } from './contract';
import { CHECKOUT_ORIGIN } from './config';
import { canDownload, newNonce, passState, type PassStore, type PendingCheckout } from './pass';
import type { Browser, Captcha, DocumentEvents, Download, PdfMaker } from './ports';

// The pass is offered only when the review finds money missing: an item below its minimum or a
// deduction above its maximum.
export const hasShortfall = (r: Review): boolean =>
  r.items.some((i) => i.status === 'below_minimum' || i.status === 'deduction_too_high');

// Answers after which a payment can never give a pass, so it is no longer kept.
const DEAD_CHECKOUT: ReadonlySet<ErrorCode> = new Set([
  'session_not_found',
  'price_mismatch',
  'pass_expired',
  'pass_revoked',
]);

// Which payments to ask about, a few calls at most: the one whose session came back from Stripe
// or was typed, the newest redeemed one (its pass can be fetched again), and the two newest not
// yet redeemed.
export function passCandidates(
  checkouts: readonly PendingCheckout[],
  sessionId: string | null,
): PendingCheckout[] {
  const chosen = [
    ...checkouts.filter((c) => c.sessionId === sessionId),
    ...checkouts.filter((c) => c.redeemed).slice(0, 1),
    ...checkouts.filter((c) => !c.redeemed).slice(0, 2),
  ];
  return chosen.filter((c, i) => chosen.findIndex((d) => d.nonce === c.nonce) === i);
}

// The answer worth showing: the one about the session the person came back with or typed;
// otherwise a payment still settling says more than one made from another browser.
const RANK: Partial<Record<ErrorCode, number>> = { payment_not_complete: 2, session_mismatch: 0 };
export function reportedFailure(failures: readonly { code: ErrorCode; matches: boolean }[]) {
  const matching = failures.find((f) => f.matches);
  if (matching) return matching.code;
  return failures.reduce<ErrorCode>(
    (best, f) => ((RANK[f.code] ?? 1) > (RANK[best] ?? 1) ? f.code : best),
    failures[0]?.code ?? 'no_checkout',
  );
}

export interface PaymentDeps {
  readonly api: Api;
  // A Turnstile widget with the action «checkout».
  readonly captcha: Captcha;
  readonly passes: PassStore;
  readonly events: DocumentEvents;
  readonly browser: Browser;
  readonly tr: Translate;
  readonly pdf: () => Promise<PdfMaker>;
  // Keeps the review's answers for the trip to the payment page and back.
  readonly keepReview: () => void;
  readonly wait?: (ms: number) => Promise<void>;
}

const FILENAMES: Record<Download, 'report' | 'letter'> = { report: 'report', letter: 'letter' };

export function setUpPayment(section: HTMLElement, deps: PaymentDeps) {
  const { api, passes, events, browser, tr } = deps;
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const buy = required(section.querySelector<HTMLElement>('[data-pass-buy]'), 'buy');
  const downloads = required(section.querySelector<HTMLElement>('[data-pass-downloads]'), 'dl');
  const validity = required(section.querySelector<HTMLElement>('[data-pass-validity]'), 'valid');
  const waiver = required(section.querySelector<HTMLInputElement>('#pass-waiver'), 'waiver');
  const waiverError = required(
    section.querySelector<HTMLElement>('[data-pass-waiver-error]'),
    'waiver error',
  );
  const session = required(section.querySelector<HTMLInputElement>('#pass-session'), 'session');
  const status = required(section.querySelector<HTMLElement>('[data-pass-status]'), 'status');
  const errorSlip = required(section.querySelector<HTMLElement>('[data-pass-error]'), 'error');
  const letterButton = required(
    section.querySelector<HTMLButtonElement>('[data-download="letter"]'),
    'letter',
  );
  const letterNote = required(section.querySelector<HTMLElement>('[data-letter-note]'), 'note');
  let current: CompletedReview | null = null;
  let busy = false;

  function setError(code: ErrorCode | null) {
    errorSlip.hidden = code === null;
    errorSlip.textContent = code === null ? '' : tr(`client.documents.error.${code}`);
  }

  function render() {
    if (!current) {
      section.hidden = true;
      return;
    }
    const stored = passes.pass();
    const paid = canDownload(passState(stored, browser.now()));
    const shortfall = hasShortfall(current.review);
    section.hidden = !paid && !shortfall;
    buy.hidden = paid;
    downloads.hidden = !paid;
    letterButton.hidden = !shortfall;
    letterNote.hidden = !shortfall;
    if (paid && stored) {
      const until = new Date(stored.expiresAt * 1000).toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
      validity.textContent = tr('client.documents.pass.valid_until', { fecha: until });
    }
  }

  // Asks for a pass with each payment this browser started that could match, newest first: the
  // session is known on the way back from Stripe, typed by hand, or any pending one.
  async function fetchPass(
    sessionId: string | null,
    via: 'return' | 'recovery',
    { quiet = false }: { quiet?: boolean } = {},
  ): Promise<true | ErrorCode> {
    const candidates = passCandidates(passes.checkouts(), sessionId);
    if (candidates.length === 0) {
      if (!quiet) {
        events.passFailed('no_checkout');
        setError('no_checkout');
      }
      return 'no_checkout';
    }
    status.textContent = tr('client.documents.pass.checking');
    setError(null);
    const failures: { code: ErrorCode; matches: boolean }[] = [];
    for (const candidate of candidates) {
      const matches = candidate.sessionId === sessionId;
      let result = await api.pass(candidate.sessionId, candidate.nonce);
      // A payment can take a moment to settle after the return from Stripe.
      for (
        let i = 0;
        matches && !quiet && !result.ok && result.code === 'payment_not_complete' && i < 3;
        i++
      ) {
        await wait(2000);
        result = await api.pass(candidate.sessionId, candidate.nonce);
      }
      if (result.ok) {
        passes.savePass({
          token: result.pass,
          expiresAt: result.expiresAt,
          readsLeft: result.readsLeft,
        });
        passes.markRedeemed(candidate.sessionId, result.expiresAt);
        events.passIssued(via);
        status.textContent = tr('client.documents.pass.issued');
        render();
        return true;
      }
      failures.push({ code: result.code, matches });
      if (result.code === 'pass_revoked') passes.forgetPass();
      if (DEAD_CHECKOUT.has(result.code)) passes.removeCheckout(candidate.sessionId);
    }
    const code = reportedFailure(failures);
    status.textContent = '';
    if (!quiet) {
      events.passFailed(code);
      setError(code);
    }
    return code;
  }

  async function pay() {
    if (!waiver.checked) {
      waiverError.textContent = tr('client.documents.pass.waiver_missing');
      waiverError.hidden = false;
      waiver.setAttribute('aria-invalid', 'true');
      waiver.focus();
      return;
    }
    setError(null);
    // An earlier payment from this browser may be paid and not yet redeemed: redeem it rather
    // than charge again.
    if (
      passes.checkouts().length > 0 &&
      (await fetchPass(null, 'recovery', { quiet: true })) === true
    )
      return;
    events.checkoutStarted();
    status.textContent = tr('client.documents.status.captcha');
    let captchaToken: string;
    try {
      captchaToken = await deps.captcha.token();
    } catch {
      status.textContent = '';
      setError('captcha_unavailable');
      return;
    }
    status.textContent = tr('client.documents.pass.redirecting');
    const nonce = newNonce((n) => browser.randomBytes(n));
    const result = await api.checkout(nonce, captchaToken);
    if (!result.ok || !result.url.startsWith(`${CHECKOUT_ORIGIN}/`)) {
      status.textContent = '';
      setError(result.ok ? 'checkout_unavailable' : result.code);
      return;
    }
    passes.addCheckout({ nonce, sessionId: result.sessionId });
    deps.keepReview();
    browser.redirect(result.url);
  }

  async function download(which: Download) {
    if (!current || !canDownload(passState(passes.pass(), browser.now()))) return render();
    setError(null);
    status.textContent = tr('client.documents.pass.generating');
    try {
      const maker = await deps.pdf();
      const blob = await (which === 'report' ? maker.report(current) : maker.letter(current));
      browser.save(blob, tr(`client.documents.${FILENAMES[which]}.filename`));
      events.downloaded(which);
      status.textContent = tr('client.documents.pass.generated');
    } catch {
      status.textContent = '';
      setError('service_unavailable');
    }
  }

  const guard = (task: () => Promise<unknown>) => async () => {
    if (busy) return;
    busy = true;
    try {
      await task();
    } finally {
      busy = false;
    }
  };

  waiver.addEventListener('change', () => {
    waiverError.hidden = true;
    waiver.removeAttribute('aria-invalid');
  });
  section.querySelector('[data-pass-pay]')?.addEventListener('click', guard(pay));
  section.querySelector('[data-pass-recover-button]')?.addEventListener(
    'click',
    guard(async () => {
      const typed = session.value.trim();
      if (typed && !SESSION_ID.test(typed)) {
        setError('session_not_found');
        return;
      }
      await fetchPass(typed || null, 'recovery');
    }),
  );
  for (const button of section.querySelectorAll<HTMLButtonElement>('[data-download]'))
    button.addEventListener(
      'click',
      guard(() => download(button.dataset['download'] === 'letter' ? 'letter' : 'report')),
    );

  return {
    show(review: CompletedReview) {
      current = review;
      status.textContent = '';
      setError(null);
      render();
    },
    hide() {
      current = null;
      render();
    },
    // Back from Stripe with `?session_id=`: the pass is asked for with the nonce kept before leaving.
    returned(sessionId: string): Promise<true | ErrorCode> {
      if (!SESSION_ID.test(sessionId)) {
        setError('session_not_found');
        return Promise.resolve('session_not_found');
      }
      return fetchPass(sessionId, 'return');
    },
  };
}
