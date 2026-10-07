import { describe, expect, it } from 'vitest';
import { createApi, parseExtraction, type Fetch } from '../../src/documents/api';

interface Call {
  url: string;
  body: Record<string, unknown>;
}

function fakeFetch(status: number, body: unknown): Fetch & { calls: Call[] } {
  const calls: Call[] = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown> });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return Object.assign(fn, { calls });
}

const extraction = {
  kind: 'settlement',
  fields: { endDate: { value: '2026-09-15', confidence: 'high' } },
  lists: { otherAccruals: [{ values: { amount: 12.5 }, confidence: 'medium' }] },
};
const request = {
  kind: 'settlement' as const,
  files: [{ mediaType: 'image/jpeg' as const, data: 'AAAA' }],
  captchaToken: 'turnstile',
};

describe('extract', () => {
  it('posts to {base}/extract and returns the reading and the next allowance', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      extraction,
      failedChecks: ['items_do_not_sum', 'x'],
      allowance: 'v1.q.s',
    });
    const result = await createApi('https://api.test', fetch).extract({ ...request, quota: null });
    expect(fetch.calls[0]?.url).toBe('https://api.test/extract');
    expect(fetch.calls[0]?.body).toEqual({ ...request, quota: null });
    expect(result).toEqual({
      ok: true,
      extraction,
      failedChecks: ['items_do_not_sum'],
      allowance: 'v1.q.s',
      readsLeft: null,
    });
  });
  it('sends a pass instead of the quota when it has one', async () => {
    const fetch = fakeFetch(200, { code: 'ok', extraction, failedChecks: [], readsLeft: 11 });
    await createApi('https://api.test', fetch).extract({ ...request, pass: 'p1', quota: 'q' });
    expect(fetch.calls[0]?.body).toEqual({ ...request, pass: 'p1' });
  });
  it('a pass read without its reads left, or a free read without a quota, is unexpected', async () => {
    const free = fakeFetch(200, { code: 'ok', extraction, failedChecks: [], readsLeft: 3 });
    expect(await createApi('https://api.test', free).extract(request)).toEqual({
      ok: false,
      code: 'unexpected_response',
    });
    const paid = fakeFetch(200, { code: 'ok', extraction, failedChecks: [], allowance: 'q' });
    expect(await createApi('https://api.test', paid).extract({ ...request, pass: 'p' })).toEqual({
      ok: false,
      code: 'unexpected_response',
    });
  });
  it('turns every API code into a failure', async () => {
    const fetch = fakeFetch(429, { code: 'daily_limit_reached' });
    expect(await createApi('https://api.test', fetch).extract(request)).toEqual({
      ok: false,
      code: 'daily_limit_reached',
    });
  });
  it('an unknown code, a bad shape or no JSON is an unexpected response', async () => {
    for (const body of [{ code: 'teapot' }, { code: 'ok', extraction: { kind: 'x' } }, 'nope'])
      expect(await createApi('https://api.test', fakeFetch(200, body)).extract(request)).toEqual({
        ok: false,
        code: 'unexpected_response',
      });
  });
  it('a request the network drops is a network error', async () => {
    const api = createApi('https://api.test', () => Promise.reject(new TypeError('offline')));
    expect(await api.extract(request)).toEqual({ ok: false, code: 'network_error' });
  });
  it('a 413 without JSON (from the function URL itself) is a payload too large', async () => {
    expect(await createApi('https://api.test', fakeFetch(413, '')).extract(request)).toEqual({
      ok: false,
      code: 'payload_too_large',
    });
  });
});

describe('parseExtraction', () => {
  it('keeps only fields and rows of the contract shape', () => {
    expect(
      parseExtraction({
        kind: 'payslip',
        fields: {
          totalAccrued: { value: 1850, confidence: 'high' },
          bad: { value: { nested: 1 }, confidence: 'high' },
          unsure: { value: 1, confidence: 'maybe' },
        },
        lists: { accruals: [{ values: { amount: 1 }, confidence: 'low' }, { values: 3 }], x: 4 },
      }),
    ).toEqual({
      kind: 'payslip',
      fields: { totalAccrued: { value: 1850, confidence: 'high' } },
      lists: { accruals: [{ values: { amount: 1 }, confidence: 'low' }] },
    });
  });
});

describe('checkout and pass', () => {
  it('starts a checkout with the nonce', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      sessionId: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/1',
    });
    expect(
      await createApi('https://api.test', fetch).checkout('n'.repeat(32), 'turnstile'),
    ).toEqual({
      ok: true,
      sessionId: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/1',
    });
    expect(fetch.calls[0]).toEqual({
      url: 'https://api.test/checkout',
      body: { nonce: 'n'.repeat(32), captchaToken: 'turnstile' },
    });
  });
  it('asks for the pass with the session and the nonce', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      pass: 'v1.p.s',
      expiresAt: 1_800_000_000,
      readsLeft: 15,
    });
    expect(await createApi('https://api.test', fetch).pass('cs_test_1', 'n'.repeat(32))).toEqual({
      ok: true,
      pass: 'v1.p.s',
      expiresAt: 1_800_000_000,
      readsLeft: 15,
    });
    expect(fetch.calls[0]?.body).toEqual({ sessionId: 'cs_test_1', nonce: 'n'.repeat(32) });
  });
  it('a payment that is not complete is a failure with its code', async () => {
    const fetch = fakeFetch(402, { code: 'payment_not_complete' });
    expect(await createApi('https://api.test', fetch).pass('cs_test_1', 'n')).toEqual({
      ok: false,
      code: 'payment_not_complete',
    });
  });
});
