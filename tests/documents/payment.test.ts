// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Api, PassResult } from '../../src/documents/contract';
import { createPassStore } from '../../src/documents/pass';
import { setUpPayment } from '../../src/documents/payment';
import type { Browser } from '../../src/documents/ports';
import { OFFER, flush, recordingEvents } from './dom';
import { completed, memoryStore, passToken, tr, unfairDismissal } from './fixtures';

const NOW = Date.UTC(2026, 9, 7);
const EXPIRES = NOW / 1000 + 7 * 86400;
const validPass = passToken({ typ: 'pass', sid: 'cs_test_1', exp: EXPIRES });

function setUp(
  passResults: PassResult[] = [],
  checkoutUrl = 'https://checkout.stripe.com/c/pay/1',
) {
  document.body.innerHTML = OFFER;
  const passes = createPassStore(memoryStore());
  const events = recordingEvents();
  const calls: string[] = [];
  const saved: string[] = [];
  const redirects: string[] = [];
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
  };
  const browser: Browser = {
    now: () => NOW,
    redirect: (url) => void redirects.push(url),
    save: (_blob, name) => void saved.push(name),
    randomBytes: (n) => new Uint8Array(n).fill(7),
  };
  const section = document.querySelector('[data-pass-offer]') as HTMLElement;
  const payment = setUpPayment(section, {
    api,
    captcha: { token: async () => 'checkout-token' },
    passes,
    events,
    browser,
    tr,
    pdf: async () => ({
      report: async () => new Blob(['%PDF']),
      letter: async () => new Blob(['%PDF']),
    }),
    keepReview: () => void (kept += 1),
    wait: async () => {},
  });
  return { payment, section, passes, events, calls, saved, redirects, kept: () => kept };
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
    payment.show(completed());
    expect(section.hidden).toBe(false);
    expect($('[data-pass-buy]').hidden).toBe(false);
    expect($('[data-pass-downloads]').hidden).toBe(true);
    payment.show(completed(unfairDismissal, { severance: 41000 }));
    expect(section.hidden).toBe(true);
    payment.hide();
    expect(section.hidden).toBe(true);
  });

  it('asks for the express waiver before paying', async () => {
    const { payment, calls, redirects } = setUp();
    payment.show(completed());
    await click('[data-pass-pay]');
    expect(calls).toEqual([]);
    expect(redirects).toEqual([]);
    expect($('[data-pass-waiver-error]').textContent).toBe('Marca la casilla para seguir');
    expect(document.activeElement?.id).toBe('pass-waiver');
  });

  it('pays: keeps the nonce, the session and the review, then goes to Stripe', async () => {
    const { payment, calls, redirects, passes, events, kept } = setUp();
    payment.show(completed());
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(calls).toEqual(['checkout 32 checkout-token']);
    expect(passes.checkouts()).toEqual([{ nonce: 'H'.repeat(32), sessionId: 'cs_test_1' }]);
    expect(kept()).toBe(1);
    expect(redirects).toEqual(['https://checkout.stripe.com/c/pay/1']);
    expect(events.log).toEqual([['checkoutStarted']]);
  });

  it('a checkout that fails keeps no nonce', async () => {
    const { payment, passes } = setUp([], 'https://evil.example/pay');
    payment.show(completed());
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(passes.checkouts()).toEqual([]);
  });

  it('an earlier payment that was paid is redeemed instead of charging again', async () => {
    const { payment, passes, calls, redirects, events } = setUp([
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_old' });
    payment.show(completed());
    $<HTMLInputElement>('#pass-waiver').checked = true;
    await click('[data-pass-pay]');
    expect(calls).toEqual(['pass cs_test_old n']);
    expect(redirects).toEqual([]);
    expect(passes.checkouts()).toEqual([]);
    expect(events.log).toEqual([['passIssued', 'recovery']]);
    expect($('[data-pass-downloads]').hidden).toBe(false);
  });

  it('an earlier payment left unpaid stays redeemable after a new one starts', async () => {
    const { payment, passes, calls, redirects } = setUp([
      { ok: false, code: 'payment_not_complete' },
    ]);
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_old' });
    payment.show(completed());
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
      { ok: false, code: 'payment_not_complete' },
      { ok: false, code: 'payment_not_complete' },
      { ok: false, code: 'payment_not_complete' },
      { ok: true, pass: validPass, expiresAt: EXPIRES, readsLeft: 15 },
    ]);
    passes.addCheckout({ nonce: 'a'.repeat(32), sessionId: 'cs_test_a' });
    passes.addCheckout({ nonce: 'b'.repeat(32), sessionId: 'cs_test_b' });
    payment.show(completed());
    await click('[data-pass-recover-button]');
    expect(calls).toEqual([
      'pass cs_test_b b',
      'pass cs_test_b b',
      'pass cs_test_b b',
      'pass cs_test_b b',
      'pass cs_test_a a',
    ]);
    expect(passes.checkouts().map((c) => c.sessionId)).toEqual(['cs_test_b']);
  });

  it('never follows a checkout address outside Stripe', async () => {
    const { payment, redirects } = setUp([], 'https://evil.example/pay');
    payment.show(completed());
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
    payment.show(completed());
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
    payment.show(completed());
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
    payment.show(completed());
    await click('[data-pass-recover-button]');
    expect(calls).toEqual(['pass cs_test_1 n']);
    expect(events.log).toEqual([['passIssued', 'recovery']]);
    expect($('[data-pass-downloads]').hidden).toBe(false);
  });

  it('with a pass, downloads the report and the letter', async () => {
    const { payment, passes, saved, events } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(completed());
    await click('[data-download="report"]');
    await click('[data-download="letter"]');
    expect(saved).toEqual(['eslojusto-informe-finiquito.pdf', 'eslojusto-recibi-no-conforme.pdf']);
    expect(events.log).toEqual([
      ['downloaded', 'report'],
      ['downloaded', 'letter'],
    ]);
  });

  it('with a pass and nothing short, only the report', () => {
    const { payment, passes, section } = setUp();
    passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
    payment.show(completed(unfairDismissal, { severance: 41000 }));
    expect(section.hidden).toBe(false);
    expect($('[data-download="letter"]').hidden).toBe(true);
  });

  it('an expired pass downloads nothing and offers the pass again', async () => {
    const { payment, passes, saved } = setUp();
    const old = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 - 1 });
    passes.savePass({ token: old, expiresAt: NOW / 1000 - 1, readsLeft: 15 });
    payment.show(completed());
    expect($('[data-pass-buy]').hidden).toBe(false);
    await click('[data-download="report"]');
    expect(saved).toEqual([]);
  });
});
