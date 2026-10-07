// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { CompletedReview } from '../../src/calculator/ports';
import { finalPayCase } from '../../src/documents/case';
import type { Api, PassResult, VerifyResult } from '../../src/documents/contract';
import { createPassStore } from '../../src/documents/pass';
import { setUpPayment } from '../../src/documents/payment';
import type { LetterDetails } from '../../src/documents/letter';
import type { Browser, PaidReview } from '../../src/documents/ports';
import { NOTICE, OFFER, flush, recordingEvents } from './dom';
import { completed, memoryStore, passToken, tr, unfairDismissal } from './fixtures';

const NOW = Date.UTC(2026, 9, 7);
const EXPIRES = NOW / 1000 + 7 * 86400;
const validPass = passToken({ typ: 'pass', sid: 'cs_test_1', exp: EXPIRES });

// The details each letter was built with, since the last setUp.
const letters: LetterDetails[] = [];
function asPaid(r: CompletedReview): PaidReview {
  const c = finalPayCase(r);
  return {
    ...c,
    letter: (kind, details, t) => {
      letters.push(details);
      return c.letter(kind, details, t);
    },
  };
}

function setUp(
  passResults: PassResult[] = [],
  checkoutUrl = 'https://checkout.stripe.com/c/pay/1',
  verifyResults: VerifyResult[] = [],
) {
  document.body.innerHTML = NOTICE + OFFER;
  const passes = createPassStore(memoryStore(), () => NOW);
  const events = recordingEvents();
  const calls: string[] = [];
  const saved: string[] = [];
  const redirects: string[] = [];
  letters.length = 0;
  let kept = 0;
  const api: Api = {
    extract: async () => ({ ok: false, code: 'service_unavailable' }),
    checkout: async (nonce, captchaToken) => {
      calls.push(`checkout ${nonce.length} ${captchaToken}`);
      return { ok: true, sessionId: 'cs_test_1', url: checkoutUrl };
    },
    pass: async (sessionId, nonce) => {
      calls.push(`pass ${sessionId} ${nonce[0]}`);
      return passResults.shift() ?? { ok: false, code: 'service_unavailable' };
    },
    verify: async (pass) => {
      calls.push(`verify ${pass === validPass ? 'valid' : 'other'}`);
      return verifyResults.shift() ?? { ok: true, expiresAt: EXPIRES, readsLeft: 15 };
    },
  };
  let changes = 0;
  const browser: Browser = {
    now: () => NOW,
    redirect: (url) => void redirects.push(url),
    save: (_blob, name) => void saved.push(name),
    randomBytes: (n) => new Uint8Array(n).fill(7),
    warnBeforeLeaving: (on) => void (leaving = on),
  };
  let leaving = false;
  const section = document.querySelector('[data-pass-offer]') as HTMLElement;
  const payment = setUpPayment(section, {
    notice: document.querySelector<HTMLElement>('[data-pass-notice]'),
    api,
    captcha: { token: async () => 'checkout-token' },
    passes,
    events,
    browser,
    tr,
    pdf: async () => ({
      render: async () => new Blob(['%PDF']),
      // Stands in for the fonts: «€» is the one character they lack here.
      unprintable: (d) =>
        (['name', 'id', 'company', 'place'] as const).filter((f) => d[f].includes('€')),
    }),
    keepReview: () => void (kept += 1),
    today: () => ({ y: 2026, m: 10, d: 7 }),
    passChanged: () => void (changes += 1),
    wait: async () => {},
  });
  return {
    payment,
    section,
    passes,
    events,
    calls,
    saved,
    redirects,
    letters,
    kept: () => kept,
    changes: () => changes,
    leaving: () => leaving,
  };
}

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const click = async (s: string) => {
  $(s).dispatchEvent(new Event('click'));
  await flush();
  await flush();
};

describe('the pass offer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows only when an item falls short', () => {
    const { payment, section } = setUp();
    payment.show(asPaid(completed()));
    expect(section.hidden).toBe(false);
    expect($('[data-pass-buy]').hidden).toBe(false);
    expect($('[data-pass-downloads]').hidden).toBe(true);
    payment.show(asPaid(completed(unfairDismissal, { severance: 41000 })));
    expect(section.hidden).toBe(true);
    payment.hide();
    expect(section.hidden).toBe(true);
  });

  it('a held pass unlocks only once the API verifies it, and only once per page', async () => {
    const { payment, passes, calls, events, changes } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    expect(payment.verified()).toBe(false);
    expect($('[data-pass-downloads]').hidden).toBe(true);
    await flush();
    expect(calls).toEqual(['verify valid']);
    expect(payment.verified()).toBe(true);
    expect(changes()).toBe(1);
    expect($('[data-pass-downloads]').hidden).toBe(false);
    expect(events.log).toEqual([['passVerified', 'ok']]);
    payment.show(asPaid(completed()));
    await flush();
    expect(calls).toEqual(['verify valid']);
  });

  it('a forged or tampered pass never unlocks: it is dropped and the offer comes back', async () => {
    const forged = passToken({ typ: 'pass', sid: 'cs_test_1', exp: EXPIRES + 999_999 });
    const { payment, passes, events, changes } = setUp([], undefined, [
      { ok: false, code: 'pass_invalid' },
    ]);
    passes.savePass({ token: forged, expiresAt: EXPIRES + 999_999, readsLeft: 15 });
    payment.show(asPaid(completed()));
    await flush();
    expect(payment.verified()).toBe(false);
    expect(changes()).toBe(0);
    expect(passes.pass()).toBeNull();
    expect($('[data-pass-downloads]').hidden).toBe(true);
    expect($('[data-pass-buy]').hidden).toBe(false);
    expect($('[data-pass-error]').textContent).toContain('Este pase no es válido');
    expect(events.log).toEqual([['passVerified', 'invalid']]);
  });

  it.each([
    ['pass_expired', 'expired', 'Tu pase ha caducado'],
    ['pass_revoked', 'revoked', 'su pago se devolvió o se anuló'],
  ] as const)('%s: dropped, with its reason', async (code, result, text) => {
    const { payment, passes, events } = setUp([], undefined, [{ ok: false, code }]);
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    await flush();
    expect(payment.verified()).toBe(false);
    expect(passes.pass()).toBeNull();
    expect($('[data-pass-error]').textContent).toContain(text);
    expect(events.log).toEqual([['passVerified', result]]);
  });

  it('a pass Stripe could not confirm is kept, locked, with a retry', async () => {
    const { payment, passes, events } = setUp([], undefined, [
      { ok: false, code: 'pass_unconfirmed' },
    ]);
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    await flush();
    expect(payment.verified()).toBe(false);
    expect(passes.pass()).not.toBeNull();
    expect($('[data-pass-verify-retry]').hidden).toBe(false);
    expect(events.log).toEqual([['passVerified', 'unavailable']]);
  });

  it('the API out of reach: nothing unlocks, the pass is kept and can be checked again', async () => {
    const { payment, passes, events, saved } = setUp([], undefined, [
      { ok: false, code: 'network_error' },
      { ok: false, code: 'service_unavailable' },
    ]);
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    await flush();
    expect(payment.verified()).toBe(false);
    expect(passes.pass()).not.toBeNull();
    expect($('[data-pass-error]').textContent).toBe(
      'No hemos podido comprobar tu pase ahora mismo. Prueba otra vez en un momento.',
    );
    expect($('[data-pass-verify-retry]').hidden).toBe(false);
    expect($('[data-pass-buy]').hidden).toBe(true);
    // A download asks again first, and builds nothing without a yes.
    await click('[data-download="report"]');
    expect(saved).toEqual([]);
    await click('[data-pass-verify-retry]');
    expect(payment.verified()).toBe(true);
    expect($('[data-pass-verify-retry]').hidden).toBe(true);
    expect(events.log).toEqual([
      ['passVerified', 'unavailable'],
      ['passVerified', 'unavailable'],
      ['passVerified', 'ok'],
    ]);
  });

  it('a pass just issued from the payment counts as verified', async () => {
    const { payment, passes, calls, changes } = setUp([
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    payment.show(asPaid(completed()));
    await payment.returned('cs_test_1');
    expect(payment.verified()).toBe(true);
    expect(changes()).toBe(1);
    expect(calls).toEqual(['pass cs_test_1 n']);
  });

  it('asks for the express waiver before paying', async () => {
    const { payment, calls, redirects } = setUp();
    payment.show(asPaid(completed()));
    await click('[data-pass-pay]');
    expect(calls).toEqual([]);
    expect(redirects).toEqual([]);
    expect($('[data-pass-waiver-error]').textContent).toBe('Marca la casilla para seguir');
    expect(document.activeElement?.id).toBe('pass-waiver');
  });

  it('pays: keeps the nonce, the session and the review, then goes to Stripe', async () => {
    const { payment, calls, redirects, passes, events, kept } = setUp();
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(calls).toEqual(['checkout 32 checkout-token']);
    expect(passes.checkouts()).toEqual([
      { nonce: 'H'.repeat(32), sessionId: 'cs_test_1', startedAt: NOW / 1000 },
    ]);
    expect(kept()).toBe(1);
    expect(redirects).toEqual(['https://checkout.stripe.com/c/pay/1']);
    expect(events.log).toEqual([['checkoutStarted']]);
  });

  it('a checkout that fails keeps no nonce', async () => {
    const { payment, passes } = setUp([], 'https://evil.example/pay');
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(passes.checkouts()).toEqual([]);
  });

  it('an earlier payment that was paid is redeemed instead of charging again', async () => {
    const { payment, passes, calls, redirects, events } = setUp([
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_old' });
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(calls).toEqual(['pass cs_test_old n']);
    expect(redirects).toEqual([]);
    expect(passes.checkouts()).toEqual([
      {
        nonce: 'n'.repeat(32),
        sessionId: 'cs_test_old',
        startedAt: NOW / 1000,
        redeemed: true,
        expiresAt: EXPIRES,
      },
    ]);
    expect(events.log).toEqual([['passIssued', 'recovery']]);
    expect($('[data-pass-downloads]').hidden).toBe(false);
  });

  it('an earlier payment left unpaid stays redeemable after a new one starts', async () => {
    const { payment, passes, calls, redirects } = setUp([
      { ok: false, code: 'payment_not_complete' },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_old' });
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(calls).toEqual(['pass cs_test_old n', 'checkout 32 checkout-token']);
    expect(redirects).toHaveLength(1);
    expect(passes.checkouts().map((c) => c.sessionId)).toEqual(['cs_test_1', 'cs_test_old']);
    expect($('[data-pass-error]').hidden).toBe(true);
  });

  it('«¿Ya has pagado?» tries every pending payment until one gives a pass', async () => {
    const { payment, passes, calls } = setUp([
      { ok: false, code: 'payment_not_complete' },
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_a' });
    passes.addCheckout({ nonce: 'b'.repeat(32), sessionId: 'cs_test_b' });
    payment.show(asPaid(completed()));
    await click('[data-pass-recover-button]');
    expect(calls).toEqual(['pass cs_test_b b', 'pass cs_test_a a']);
    expect(passes.checkouts().map((c) => [c.sessionId, c.redeemed ?? false])).toEqual([
      ['cs_test_b', false],
      ['cs_test_a', true],
    ]);
  });

  it('a redeemed payment stays until its pass expires, so a lost pass can be fetched again', async () => {
    const { payment, passes, calls } = setUp([
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 14 },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    payment.show(asPaid(completed()));
    expect(await payment.returned('cs_test_1')).toBe(true);
    passes.forgetPass();
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('#pass-session').value = 'cs_test_1';
    await click('[data-pass-recover-button]');
    expect(calls).toEqual(['pass cs_test_1 n', 'pass cs_test_1 n']);
    expect(passes.pass()?.readsLeft).toBe(14);
    expect($('[data-pass-downloads]').hidden).toBe(false);
  });

  it('back from Stripe, the error shown is about that payment, not an older one', async () => {
    const { payment, passes } = setUp([
      { ok: false, code: 'payment_not_complete' },
      { ok: false, code: 'payment_not_complete' },
      { ok: false, code: 'payment_not_complete' },
      { ok: false, code: 'payment_not_complete' },
      { ok: false, code: 'session_mismatch' },
    ]);
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_old' });
    passes.addCheckout({ nonce: 'b'.repeat(32), sessionId: 'cs_test_new' });
    payment.show(asPaid(completed()));
    expect(await payment.returned('cs_test_new')).toBe('payment_not_complete');
    expect($('[data-pass-error]').textContent).toContain('El pago aún no está completo');
  });

  it('a payment that can never give a pass is dropped, and so is one abandoned for a week', async () => {
    let now = NOW;
    const passes = createPassStore(memoryStore(), () => now);
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_old' });
    now += 8 * 86_400_000;
    expect(passes.checkouts()).toEqual([]);
    const { payment, passes: own } = setUp([
      { ok: false, code: 'session_not_found' },
      { ok: false, code: 'price_mismatch' },
    ]);
    own.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_a' });
    own.addCheckout({ nonce: 'b'.repeat(32), sessionId: 'cs_test_b' });
    payment.show(asPaid(completed()));
    await click('[data-pass-recover-button]');
    expect(own.checkouts()).toEqual([]);
  });

  it('asks about a few payments at most', async () => {
    const { payment, passes, calls } = setUp();
    for (const id of ['a', 'b', 'c', 'd'])
      passes.addCheckout({ nonce: id.repeat(32), sessionId: `cs_test_${id}` });
    payment.show(asPaid(completed()));
    await click('[data-pass-recover-button]');
    expect(calls).toEqual(['pass cs_test_d d', 'pass cs_test_c c']);
  });

  it('never follows a checkout address outside Stripe', async () => {
    const { payment, redirects } = setUp([], 'https://evil.example/pay');
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(redirects).toEqual([]);
    expect($('[data-pass-error]').textContent).toContain('No se ha podido abrir el pago');
  });

  it('back from Stripe: asks for the pass, waits out a payment still settling, then offers downloads', async () => {
    const { payment, passes, calls, events } = setUp([
      { ok: false, code: 'payment_not_complete' },
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    payment.show(asPaid(completed()));
    expect(await payment.returned('cs_test_1')).toBe(true);
    expect(calls).toEqual(['pass cs_test_1 n', 'pass cs_test_1 n']);
    expect(passes.pass()).toEqual({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    expect($('[data-pass-downloads]').hidden).toBe(false);
    expect($('[data-pass-buy]').hidden).toBe(true);
    expect($('[data-pass-validity]').textContent).toBe(
      'Tu pase vale hasta el 14 de octubre de 2026.',
    );
    expect(events.log).toEqual([['passIssued', 'return']]);
  });

  it('«¿Ya has pagado?» without a payment from this browser says so', async () => {
    const { payment, calls, events } = setUp();
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('#pass-session').value = 'cs_test_9';
    await click('[data-pass-recover-button]');
    expect(calls).toEqual([]);
    expect($('[data-pass-error]').textContent).toContain(
      'No hay ningún pago hecho desde este navegador',
    );
    expect(events.log).toEqual([['passFailed', 'no_checkout']]);
  });

  it('«¿Ya has pagado?» recovers the pass of the last payment', async () => {
    const { payment, passes, calls, events } = setUp([
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    payment.show(asPaid(completed()));
    await click('[data-pass-recover-button]');
    expect(calls).toEqual(['pass cs_test_1 n']);
    expect(events.log).toEqual([['passIssued', 'recovery']]);
    expect($('[data-pass-downloads]').hidden).toBe(false);
  });

  it('with a pass, downloads the report and the letter', async () => {
    const { payment, passes, saved, events } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    await click('[data-download="report"]');
    await click('[data-download="letter"]');
    expect(saved).toEqual(['eslojusto-informe-finiquito.pdf', 'eslojusto-recibi-no-conforme.pdf']);
    expect(events.log).toEqual([
      ['passVerified', 'ok'],
      ['downloaded', 'report'],
      ['downloaded', 'letter', 'none', 'items'],
    ]);
  });

  it('the letter takes what the person adds, dated today unless changed', async () => {
    const { payment, passes, letters, events } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    expect($<HTMLInputElement>('[data-letter-field="date"]').value).toBe('2026-10-07');
    $<HTMLInputElement>('[data-letter-field="name"]').value = 'Alex Ejemplo';
    $<HTMLInputElement>('[data-letter-field="company"]').value = 'Empresa Ficticia SL';
    await click('[data-download="letter"]');
    expect(letters).toEqual([
      {
        name: 'Alex Ejemplo',
        id: '',
        company: 'Empresa Ficticia SL',
        place: '',
        date: { y: 2026, m: 10, d: 7 },
      },
    ]);
    expect(events.log).toEqual([
      ['passVerified', 'ok'],
      ['downloaded', 'letter', 'some', 'items'],
    ]);
  });

  it('warns about an ID that is no DNI or NIE, and downloads the letter anyway', async () => {
    const { payment, passes, saved } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    const id = $<HTMLInputElement>('[data-letter-field="id"]');
    id.value = '1234';
    id.dispatchEvent(new Event('change'));
    expect($('[data-letter-id-warning]').hidden).toBe(false);
    expect($('[data-letter-id-warning]').textContent).toContain('No parece un DNI ni un NIE');
    await click('[data-download="letter"]');
    expect(saved).toEqual(['eslojusto-recibi-no-conforme.pdf']);
    id.value = '12345678Z';
    id.dispatchEvent(new Event('input'));
    expect($('[data-letter-id-warning]').hidden).toBe(true);
  });

  it('a field with a character the fonts lack keeps its blank line, with a warning', async () => {
    const { payment, passes, letters, events } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    await flush();
    $<HTMLInputElement>('[data-letter-field="name"]').value = 'Alex Ejemplo';
    $<HTMLInputElement>('[data-letter-field="company"]').value = 'Empresa € SL';
    await click('[data-download="letter"]');
    expect(letters[0]).toMatchObject({ name: 'Alex Ejemplo', company: '' });
    expect($('[data-letter-glyph-warning]').hidden).toBe(false);
    expect($('[data-letter-glyph-warning]').textContent).toBe(
      'Algunas letras no se pueden escribir en la carta: se deja la línea en blanco para escribirlo a mano.',
    );
    expect(events.log.at(-1)).toEqual(['downloaded', 'letter', 'some', 'items']);
  });

  it('starting over forgets what was typed for the letter', () => {
    const { payment, passes } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed()));
    $<HTMLInputElement>('[data-letter-field="name"]').value = 'Alex Ejemplo';
    payment.hide();
    expect($<HTMLInputElement>('[data-letter-field="name"]').value).toBe('');
    expect($<HTMLInputElement>('[data-letter-field="date"]').value).toBe('');
  });

  it('with a pass and nothing short, the general letter too, and still no offer to pay', async () => {
    const { payment, passes, section, saved, events } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(asPaid(completed(unfairDismissal, { severance: 41000 })));
    await flush();
    expect(section.hidden).toBe(false);
    expect($('[data-pass-buy]').hidden).toBe(true);
    expect($('[data-letter]').hidden).toBe(false);
    await click('[data-pass-offer] [data-download="letter"]');
    expect(saved).toEqual(['eslojusto-recibi-no-conforme.pdf']);
    expect(events.log.at(-1)).toEqual(['downloaded', 'letter', 'none', 'general']);
  });

  it('without a pass and nothing short, nothing is offered', () => {
    const { payment, section } = setUp();
    payment.show(asPaid(completed(unfairDismissal, { severance: 41000 })));
    expect(section.hidden).toBe(true);
  });

  it('an expired pass downloads nothing and offers the pass again', async () => {
    const { payment, passes, saved } = setUp();
    const old = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 - 1 });
    passes.savePass({ token: old, expiresAt: NOW / 1000 - 1, readsLeft: 15 });
    payment.show(asPaid(completed()));
    expect($('[data-pass-buy]').hidden).toBe(false);
    await click('[data-download="report"]');
    expect(saved).toEqual([]);
  });
});

describe('the notice after paying', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  async function paid() {
    const t = setUp([{ ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 }]);
    t.passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    t.payment.show(asPaid(completed()));
    await t.payment.returned('cs_test_1');
    return t;
  }

  it('back from Stripe: says to download now, takes the focus and warns before leaving', async () => {
    const { leaving } = await paid();
    const notice = $('[data-pass-notice]');
    expect(notice.hidden).toBe(false);
    expect(document.activeElement).toBe(notice);
    expect($('[data-notice-text]').textContent).toBe(
      'Descarga ahora tu informe y tu carta y guárdalos: no guardamos tu revisión en ningún sitio. Durante 7 días, en este navegador, puedes corregir tus datos y volver a descargarlos sin pagar otra vez.',
    );
    expect(leaving()).toBe(true);
  });

  it('the first download stops the warning; both shrink the notice to one line', async () => {
    const { leaving, saved } = await paid();
    await click('[data-pass-notice] [data-download="report"]');
    expect(leaving()).toBe(false);
    expect($('[data-notice-full]').hidden).toBe(false);
    await click('[data-pass-notice] [data-download="letter"]');
    expect(saved).toEqual(['eslojusto-informe-finiquito.pdf', 'eslojusto-recibi-no-conforme.pdf']);
    expect($('[data-notice-full]').hidden).toBe(true);
    expect($('[data-notice-text]').textContent).toBe(
      'Informe y carta descargados. Guárdalos: no guardamos tu revisión.',
    );
    expect(leaving()).toBe(false);
  });

  it('starting over before any download takes the warning away with the notice', async () => {
    const { payment, leaving } = await paid();
    expect(leaving()).toBe(true);
    payment.hide();
    expect($('[data-pass-notice]').hidden).toBe(true);
    expect(leaving()).toBe(false);
    payment.show(asPaid(completed()));
    expect(leaving()).toBe(false);
  });

  it('a pass that dies during the visit takes the warning away with the notice', async () => {
    const t = setUp([{ ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 }]);
    t.passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    t.payment.show(asPaid(completed()));
    await t.payment.returned('cs_test_1');
    expect(t.leaving()).toBe(true);
    t.passes.forgetPass();
    t.payment.show(asPaid(completed()));
    expect($('[data-pass-notice]').hidden).toBe(true);
    expect(t.leaving()).toBe(false);
  });

  it('a pass recovered by hand or one already held shows no notice and never warns', async () => {
    const { payment, passes, leaving } = setUp([
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    payment.show(asPaid(completed()));
    await click('[data-pass-recover-button]');
    expect(payment.verified()).toBe(true);
    expect($('[data-pass-notice]').hidden).toBe(true);
    expect(leaving()).toBe(false);
  });
});
