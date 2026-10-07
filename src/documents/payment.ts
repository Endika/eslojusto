import type { CompletedReview } from '../calculator/ports';
import { required } from '../calculator/dom';
import type { Review } from '../engine/review';
import type { Translate } from '../i18n/client';
import { SESSION_ID, type Api, type ErrorCode } from './contract';
import { CHECKOUT_ORIGIN } from './config';
import { canDownload, newNonce, passState, type PassStore } from './pass';
import type { Browser, DocumentEvents, Download, PdfMaker } from './ports';

// The pass is offered only when the review finds money missing: an item below its minimum or a
// deduction above its maximum.
export const hasShortfall = (r: Review): boolean =>
  r.items.some((i) => i.status === 'below_minimum' || i.status === 'deduction_too_high');

export interface PaymentDeps {
  readonly api: Api;
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

  async function fetchPass(
    sessionId: string,
    via: 'return' | 'recovery',
  ): Promise<true | ErrorCode> {
    const checkout = passes.checkout();
    if (!checkout) {
      events.passFailed('no_checkout');
      setError('no_checkout');
      return 'no_checkout';
    }
    status.textContent = tr('client.documents.pass.checking');
    setError(null);
    let result = await api.pass(sessionId, checkout.nonce);
    // A payment can take a moment to settle after the return from Stripe.
    for (let i = 0; !result.ok && result.code === 'payment_not_complete' && i < 3; i++) {
      await wait(2000);
      result = await api.pass(sessionId, checkout.nonce);
    }
    if (!result.ok) {
      status.textContent = '';
      events.passFailed(result.code);
      setError(result.code);
      return result.code;
    }
    passes.savePass({ token: result.pass, expiresAt: result.expiresAt });
    passes.saveCheckout({ nonce: checkout.nonce, sessionId });
    events.passIssued(via);
    status.textContent = tr('client.documents.pass.issued');
    render();
    return true;
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
    const nonce = newNonce((n) => browser.randomBytes(n));
    passes.saveCheckout({ nonce, sessionId: null });
    events.checkoutStarted();
    status.textContent = tr('client.documents.pass.redirecting');
    const result = await api.checkout(nonce);
    if (!result.ok || !result.url.startsWith(`${CHECKOUT_ORIGIN}/`)) {
      status.textContent = '';
      setError(result.ok ? 'checkout_unavailable' : result.code);
      return;
    }
    passes.saveCheckout({ nonce, sessionId: result.sessionId });
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
      const sessionId = typed || passes.checkout()?.sessionId || '';
      if (!SESSION_ID.test(sessionId)) {
        setError(typed ? 'session_not_found' : 'no_checkout');
        return;
      }
      await fetchPass(sessionId, 'recovery');
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
