import { required } from '../calculator/dom';
import { parseDate, toIso, type CivilDate } from '../engine/date';
import type { Translate } from '../i18n/client';
import { SESSION_ID, type ErrorCode, type PassApi } from './contract';
import { CHECKOUT_ORIGIN } from './config';
import {
  letterPrefilled,
  looksLikeDniOrNie,
  type LetterDetails,
  type LetterField,
  type LetterKind,
} from './letter';
import { noticeView, warnsOnLeave, type NoticeState } from './notice';
import { canDownload, newNonce, passState, type PassStore, type PendingCheckout } from './pass';
import type {
  Browser,
  Captcha,
  DocumentEvents,
  Download,
  PaidReview,
  PassVerifyResult,
  PdfMaker,
} from './ports';

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
  readonly api: PassApi;
  // A Turnstile widget with the action «checkout».
  readonly captcha: Captcha;
  readonly passes: PassStore;
  readonly events: DocumentEvents;
  readonly browser: Browser;
  readonly tr: Translate;
  readonly pdf: () => Promise<PdfMaker>;
  // Keeps the review's answers for the trip to the payment page and back.
  readonly keepReview: () => void;
  // The letter's date starts at today, in the person's own calendar.
  readonly today: () => CivilDate;
  // Above the result: the notice after a payment, with its own download buttons.
  readonly notice?: HTMLElement | null;
  // Told whenever the pass is verified or dropped, so the result can be shown again.
  readonly passChanged: () => void;
  readonly wait?: (ms: number) => Promise<void>;
}

// Answers after which the pass in this browser is useless, so it is forgotten.
const DEAD_PASS = {
  pass_invalid: 'invalid',
  pass_expired: 'expired',
  pass_revoked: 'revoked',
} as const satisfies Partial<Record<ErrorCode, PassVerifyResult>>;

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
  const letter = required(section.querySelector<HTMLElement>('[data-letter]'), 'letter');
  const letterField = (name: keyof LetterDetails) =>
    required(
      letter.querySelector<HTMLInputElement>(`[data-letter-field="${name}"]`),
      `letter ${name}`,
    );
  const letterInputs = {
    name: letterField('name'),
    id: letterField('id'),
    company: letterField('company'),
    place: letterField('place'),
    date: letterField('date'),
  };
  const glyphWarning = required(
    letter.querySelector<HTMLElement>('[data-letter-glyph-warning]'),
    'glyph warning',
  );
  const idWarning = required(
    letter.querySelector<HTMLElement>('[data-letter-id-warning]'),
    'id warning',
  );
  const retry = required(
    section.querySelector<HTMLButtonElement>('[data-pass-verify-retry]'),
    'retry',
  );
  let current: PaidReview | null = null;
  let busy = false;
  // The pass the API confirmed during this page's life. Kept in memory only: a reload asks again.
  let verifiedToken: string | null = null;
  let fresh = false;
  const downloaded = new Set<Download>();
  const notice = deps.notice ?? null;
  let verifying: Promise<boolean> | null = null;

  function setError(code: ErrorCode | null) {
    errorSlip.hidden = code === null;
    errorSlip.textContent = code === null ? '' : tr(`client.documents.error.${code}`);
  }

  // A pass this browser holds that has not run out by its own dates; only the API can say it is good.
  const heldPass = () => {
    const stored = passes.pass();
    return stored && canDownload(passState(stored, browser.now())) ? stored : null;
  };
  const verified = () => {
    const held = heldPass();
    return held !== null && held.token === verifiedToken;
  };

  function settle(token: string | null) {
    const before = verified();
    verifiedToken = token;
    render();
    if (verified() !== before) deps.passChanged();
  }

  // Asks the API whether the pass still holds: signature, expiry and the payment behind it. Until
  // it says yes, nothing a pass pays for is shown or built.
  function verify(): Promise<boolean> {
    if (verified()) return Promise.resolve(true);
    const held = heldPass();
    if (!held) return Promise.resolve(false);
    verifying ??= (async () => {
      retry.hidden = true;
      setError(null);
      status.textContent = tr('client.documents.verify.checking');
      const r = await api.verify(held.token);
      status.textContent = '';
      if (r.ok) {
        passes.savePass({ ...held, expiresAt: r.expiresAt, readsLeft: r.readsLeft });
        events.passVerified('ok');
        settle(held.token);
        return true;
      }
      const dead = r.code in DEAD_PASS ? DEAD_PASS[r.code as keyof typeof DEAD_PASS] : null;
      events.passVerified(dead ?? 'unavailable');
      if (dead) {
        passes.forgetPass();
        errorSlip.hidden = false;
        // «¿Ya has pagado?» can only issue it again with a payment this browser started.
        const recoverable = r.code === 'pass_invalid' && passes.checkouts().some((c) => c.redeemed);
        errorSlip.textContent = tr(
          recoverable
            ? 'client.documents.verify.pass_invalid_recoverable'
            : `client.documents.verify.${r.code as keyof typeof DEAD_PASS}`,
        );
      } else {
        errorSlip.hidden = false;
        errorSlip.textContent = tr('client.documents.verify.unavailable');
        retry.hidden = false;
      }
      settle(null);
      return false;
    })().finally(() => {
      verifying = null;
    });
    return verifying;
  }

  function renderNotice() {
    if (!notice) return;
    const state: NoticeState = {
      fresh,
      showing: current !== null && verified(),
      downloaded,
    };
    const view = noticeView(state);
    notice.hidden = view === 'hidden';
    notice.dataset['view'] = view;
    for (const el of notice.querySelectorAll<HTMLElement>('[data-notice-full]'))
      el.hidden = view !== 'full';
    for (const el of notice.querySelectorAll<HTMLElement>('[data-notice-done]'))
      el.hidden = view !== 'done';
    const text = notice.querySelector<HTMLElement>('[data-notice-text]');
    if (text)
      text.textContent = tr(
        view === 'done' ? 'client.documents.notice.done' : 'client.documents.notice.full',
      );
    browser.warnBeforeLeaving(warnsOnLeave(state));
  }

  function render() {
    renderNotice();
    if (!current) {
      section.hidden = true;
      return;
    }
    const stored = passes.pass();
    const held = heldPass() !== null;
    const paid = verified();
    section.hidden = !held && !current.offer;
    buy.hidden = held;
    downloads.hidden = !paid;
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
        if (via === 'return') fresh = true;
        // Just issued by the API from the payment itself: as verified as a verify would make it.
        settle(result.pass);
        if (via === 'return' && notice && !notice.hidden) notice.focus();
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

  function letterDetails(): LetterDetails {
    let date: CivilDate | null = null;
    try {
      date = letterInputs.date.value ? parseDate(letterInputs.date.value) : null;
    } catch {
      // A date the browser lets through unfinished keeps its line.
    }
    const typed = (f: LetterField) => letterInputs[f].value.normalize('NFC');
    return {
      name: typed('name'),
      id: typed('id'),
      company: typed('company'),
      place: typed('place'),
      date,
    };
  }

  // A warning only: the letter is downloaded with whatever was typed.
  function checkId() {
    const typed = letterInputs.id.value.trim();
    const odd = typed !== '' && !looksLikeDniOrNie(typed);
    idWarning.hidden = !odd;
    idWarning.textContent = odd ? tr('client.documents.letter.id_warning') : '';
  }

  function clearLetter() {
    for (const input of Object.values(letterInputs)) input.value = '';
    glyphWarning.hidden = true;
    checkId();
  }

  // A letter button names its kind when the review offers more than one letter.
  const letterKindOf = (button: HTMLElement, review: PaidReview): LetterKind =>
    review.letterKinds.find((k) => k === button.dataset['letterKind']) ?? review.letterKinds[0];

  async function download(which: Download, button: HTMLElement) {
    if (!current || !(await verify())) return render();
    setError(null);
    status.textContent = tr('client.documents.pass.generating');
    try {
      const maker = await deps.pdf();
      let details = letterDetails();
      if (which === 'letter') {
        const blanked = maker.unprintable(details);
        glyphWarning.hidden = blanked.length === 0;
        glyphWarning.textContent =
          blanked.length === 0 ? '' : tr('client.documents.letter.glyph_warning');
        details = { ...details, ...Object.fromEntries(blanked.map((f) => [f, ''])) };
      }
      const kind = letterKindOf(button, current);
      const blob = await maker.render(
        which === 'report' ? current.report(tr, deps.today()) : current.letter(kind, details, tr),
      );
      browser.save(blob, tr(`client.documents.${FILENAMES[which]}.filename`));
      if (which === 'letter') events.downloaded(which, letterPrefilled(details), kind);
      else events.downloaded(which);
      downloaded.add(which);
      renderNotice();
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

  retry.addEventListener('click', guard(verify));
  letterInputs.id.addEventListener('change', checkId);
  letterInputs.id.addEventListener('input', () => {
    if (!idWarning.hidden) checkId();
  });

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
  for (const button of [
    ...section.querySelectorAll<HTMLButtonElement>('[data-download]'),
    ...(notice?.querySelectorAll<HTMLButtonElement>('[data-download]') ?? []),
  ])
    button.addEventListener(
      'click',
      guard(() => download(button.dataset['download'] === 'letter' ? 'letter' : 'report', button)),
    );

  return {
    show(review: PaidReview) {
      current = review;
      if (letterInputs.date.value === '') letterInputs.date.value = toIso(deps.today());
      status.textContent = '';
      setError(null);
      render();
      if (heldPass() && !verified()) void verify();
    },
    // Whether the pass in this browser was confirmed by the API during this page's life.
    verified,
    hide() {
      current = null;
      // The notice belongs to the review that was paid for; starting over ends it.
      fresh = false;
      clearLetter();
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
