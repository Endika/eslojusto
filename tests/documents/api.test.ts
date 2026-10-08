import { describe, expect, it } from 'vitest';
import { EXTRACT_TIMEOUT_SECONDS } from '../../api/src/config';
import { LIMITS as API_LIMITS, PAGE_KINDS as API_PAGE_KINDS } from '../../api/src/domain/documents';
import { READABILITY as API_READABILITY } from '../../api/src/domain/extraction-schema';
import { EMPLOYMENT_SECTIONS } from '../../api/src/domain/employment-schema';
import { RENTAL_SECTIONS } from '../../api/src/domain/rental-schema';
import { API_TIMEOUT_MS, createApi, parseExtraction, type Fetch } from '../../src/documents/api';
import {
  EMPLOYMENT_EXTRACTION,
  EMPLOYMENT_LIST_MAXIMA,
  FINAL_PAY_EXTRACTION,
  LIMITS,
  PAGE_KINDS,
  READABILITY,
  RENTAL_EXTRACTION,
} from '../../src/documents/contract';

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

// Three function URLs, as the API deploys them.
const ENDPOINTS = {
  extract: 'https://extract.api.test/',
  checkout: 'https://checkout.api.test/',
  pass: 'https://pass.api.test/',
};

// As the API sends it: page numbers per document, rows under `lists`.
const sent = {
  pages: [
    {
      page: 1,
      kind: 'settlement_proposal',
      document: 1,
      readability: { value: 'ok', confidence: 'high' },
      confidence: 'high',
    },
  ],
  documents: [{ kind: 'settlement_proposal', pages: [1] }],
  fields: { endDate: { value: '2026-09-15', confidence: 'high', source: 'settlement_proposal' } },
  lists: {},
  conflicts: [],
};
// As the page keeps it: how many pages per document, and the rows on their own.
const extraction = {
  pages: [{ page: 1, kind: 'settlement_proposal', readability: 'ok' }],
  documents: [{ kind: 'settlement_proposal', pages: 1 }],
  fields: sent.fields,
  contracts: [],
  conflicts: [],
};
const finalPayApi = (fetch: Fetch) => createApi(ENDPOINTS, fetch, FINAL_PAY_EXTRACTION);
const parseFinalPay = (v: unknown) => parseExtraction(v, FINAL_PAY_EXTRACTION);
const request = {
  files: [{ mediaType: 'image/jpeg' as const, data: 'AAAA' }],
  captchaToken: 'turnstile',
};

describe('extract', () => {
  it('posts to {base}/extract and returns the reading and the next allowance', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      extraction: sent,
      failedChecks: ['items_do_not_sum', 'x'],
      allowance: 'v1.q.s',
    });
    const result = await finalPayApi(fetch).extract({ ...request, quota: null });
    expect(fetch.calls[0]?.url).toBe('https://extract.api.test/');
    expect(fetch.calls[0]?.body).toEqual({ ...request, quota: null });
    expect(result).toEqual({
      ok: true,
      extraction,
      failedChecks: ['items_do_not_sum'],
      allowance: 'v1.q.s',
      readsLeft: null,
      escalated: null,
    });
  });
  it('passes on whether the reading escalated', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      extraction: sent,
      failedChecks: [],
      allowance: 'q',
      escalated: true,
    });
    expect(await finalPayApi(fetch).extract(request)).toMatchObject({ escalated: true });
  });
  it('sends a pass instead of the quota when it has one', async () => {
    const fetch = fakeFetch(200, { code: 'ok', extraction: sent, failedChecks: [], readsLeft: 11 });
    await finalPayApi(fetch).extract({ ...request, pass: 'p1', quota: 'q' });
    expect(fetch.calls[0]?.body).toEqual({ ...request, pass: 'p1' });
  });
  it('a pass read without its reads left, or a free read without a quota, is unexpected', async () => {
    const free = fakeFetch(200, { code: 'ok', extraction: sent, failedChecks: [], readsLeft: 3 });
    expect(await finalPayApi(free).extract(request)).toEqual({
      ok: false,
      code: 'unexpected_response',
    });
    const paid = fakeFetch(200, { code: 'ok', extraction: sent, failedChecks: [], allowance: 'q' });
    expect(await finalPayApi(paid).extract({ ...request, pass: 'p' })).toEqual({
      ok: false,
      code: 'unexpected_response',
    });
  });
  it('passes on why a read found nothing, page by page, and nothing else', async () => {
    const fetch = fakeFetch(422, {
      code: 'nothing_read',
      pages: [
        { page: 1, kind: 'payslip', readability: { value: 'blurry', confidence: 'high' } },
        {
          page: 2,
          kind: 'other',
          readability: { value: 'foreign_jurisdiction', confidence: 'high' },
        },
        { page: 3, kind: 'other', readability: { value: 'Barcelona', confidence: 'high' } },
      ],
      allowance: 'not-for-a-read-that-found-nothing',
    });
    expect(await finalPayApi(fetch).extract(request)).toEqual({
      ok: false,
      code: 'nothing_read',
      pages: [
        { page: 1, kind: 'payslip', readability: 'blurry' },
        { page: 2, kind: 'other', readability: 'foreign_jurisdiction' },
      ],
    });
  });
  it('mirrors the API’s readability list', () => {
    expect(READABILITY).toEqual(API_READABILITY);
  });
  it('mirrors the API’s page kinds', () => {
    expect(PAGE_KINDS).toEqual(API_PAGE_KINDS);
  });
  it('reads the rental fields and lists the API merges, from every section', () => {
    const sections = Object.values(RENTAL_SECTIONS);
    const names = (key: 'fields' | 'lists') =>
      [...new Set(sections.flatMap((section) => Object.keys(section[key])))].sort();
    expect([...RENTAL_EXTRACTION.fields].sort()).toEqual(names('fields'));
    expect([...RENTAL_EXTRACTION.lists].sort()).toEqual(names('lists'));
  });
  it('reads the employment fields the API merges and the lists of every section, as long', () => {
    // The contract's fields, and the offer's prefixed, as api/src/domain/employment-merge.ts names them.
    const offer = Object.keys(EMPLOYMENT_SECTIONS.job_offer.fields).map(
      (name) => `offer${name.charAt(0).toUpperCase()}${name.slice(1)}`,
    );
    expect([...EMPLOYMENT_EXTRACTION.fields].sort()).toEqual(
      [...Object.keys(EMPLOYMENT_SECTIONS.employment_contract.fields), ...offer].sort(),
    );
    const lists = Object.fromEntries(
      Object.values(EMPLOYMENT_SECTIONS).flatMap((section) =>
        Object.entries(section.lists).map(([name, list]) => [name, list.maxItems]),
      ),
    );
    expect(EMPLOYMENT_LIST_MAXIMA).toEqual(lists);
    expect([...EMPLOYMENT_EXTRACTION.lists].sort()).toEqual(Object.keys(lists).sort());
  });
  it('takes as many images and as large a request as the API', () => {
    expect(LIMITS.maxImages).toBe(API_LIMITS.maxImages);
    expect(LIMITS.maxPayloadBytes).toBe(API_LIMITS.maxPayloadBytes);
  });
  it('turns every API code into a failure', async () => {
    const fetch = fakeFetch(429, { code: 'daily_limit_reached' });
    expect(await finalPayApi(fetch).extract(request)).toEqual({
      ok: false,
      code: 'daily_limit_reached',
    });
  });
  it('an unknown code, a bad shape or no JSON is an unexpected response', async () => {
    for (const body of [{ code: 'teapot' }, { code: 'ok', extraction: { documents: [] } }, 'nope'])
      expect(await finalPayApi(fakeFetch(200, body)).extract(request)).toEqual({
        ok: false,
        code: 'unexpected_response',
      });
  });
  it('a 429 or a 5xx without a code means the service is busy or down', async () => {
    for (const [status, body] of [
      [429, 'Too Many Requests'],
      [502, ''],
      [503, { message: 'Service Unavailable' }],
    ] as const)
      expect(await finalPayApi(fakeFetch(status, body)).extract(request), String(status)).toEqual({
        ok: false,
        code: 'service_unavailable',
      });
  });
  it('a request the network drops is a network error', async () => {
    const api = finalPayApi(() => Promise.reject(new TypeError('offline')));
    expect(await api.extract(request)).toEqual({ ok: false, code: 'network_error' });
  });
  it('a 413 without JSON (from the function URL itself) is a payload too large', async () => {
    expect(await finalPayApi(fakeFetch(413, '')).extract(request)).toEqual({
      ok: false,
      code: 'payload_too_large',
    });
  });
});

describe('the time the browser waits', () => {
  it('outlasts the extract function by a minute, for the upload', () => {
    expect(API_TIMEOUT_MS).toBeGreaterThanOrEqual((EXTRACT_TIMEOUT_SECONDS + 60) * 1000);
  });
});

describe('parseExtraction', () => {
  it('keeps only what has the contract’s shape, and counts each document’s pages', () => {
    expect(
      parseFinalPay({
        pages: [
          { page: 1, kind: 'dismissal_letter', readability: { value: 'ok', confidence: 'high' } },
          { page: 2, kind: 'payslip', readability: { value: 'blurry', confidence: 'low' } },
          { page: 3, kind: 'other', readability: { value: 'illegible', confidence: 'high' } },
          { page: 4, kind: 'other', readability: 'ok' },
          { page: 0, kind: 'other', readability: { value: 'ok', confidence: 'high' } },
          {
            page: LIMITS.maxImages + 1,
            kind: 'other',
            readability: { value: 'ok', confidence: 'high' },
          },
          { page: 5, kind: 'contract', readability: { value: 'ok', confidence: 'high' } },
        ],
        documents: [
          { kind: 'dismissal_letter', pages: [1, 2, 3] },
          { kind: 'payslip', pages: [4], month: '2026-08' },
          { kind: 'payslip', pages: [5], month: 'agosto' },
          { kind: 'contract', pages: [6] },
          { kind: 'other', pages: [] },
        ],
        fields: {
          payslipTotalAccrued: { value: 1850, confidence: 'high', source: 'payslip' },
          bad: { value: { nested: 1 }, confidence: 'high', source: 'payslip' },
          unsure: { value: 1, confidence: 'maybe', source: 'payslip' },
          severance: { value: 1, confidence: 'high', source: 'other' },
          endDate: { value: '2026-09-15', confidence: 'high' },
          extraPayPaid: { value: true, confidence: 'medium', source: 'payslip' },
        },
        lists: {
          contracts: [
            { values: { startDate: '2020-01-01' }, confidence: 'high', source: 'work_history' },
            { values: 3 },
          ],
          x: 4,
        },
        conflicts: [
          { field: 'endDate', sources: ['settlement_proposal', 'dismissal_letter', 'x'] },
          { field: 'name', sources: ['payslip'] },
          { field: 'cause', sources: [] },
        ],
      }),
    ).toEqual({
      pages: [
        { page: 1, kind: 'dismissal_letter', readability: 'ok' },
        { page: 2, kind: 'payslip', readability: 'blurry' },
      ],
      documents: [
        { kind: 'dismissal_letter', pages: 3 },
        { kind: 'payslip', pages: 1, month: '2026-08' },
        { kind: 'payslip', pages: 1 },
      ],
      fields: {
        payslipTotalAccrued: { value: 1850, confidence: 'high', source: 'payslip' },
        extraPayPaid: { value: true, confidence: 'medium', source: 'payslip' },
      },
      contracts: [
        { values: { startDate: '2020-01-01' }, confidence: 'high', source: 'work_history' },
      ],
      conflicts: [{ field: 'endDate', sources: ['settlement_proposal', 'dismissal_letter'] }],
    });
  });
});

describe('the review a page reads for', () => {
  const ok = (extraction: object) =>
    fakeFetch(200, {
      code: 'ok',
      extraction,
      failedChecks: [],
      allowance: 'q',
      sessionId: 'cs_test_1',
      url: 'u',
    });
  it('the final pay names none, in the read or in the checkout', async () => {
    const fetch = ok(sent);
    await finalPayApi(fetch).extract(request);
    await finalPayApi(fetch).checkout('n'.repeat(32), 'turnstile');
    expect(fetch.calls[0]?.body).not.toHaveProperty('review');
    expect(fetch.calls[1]?.body).not.toHaveProperty('returnTo');
  });
  it('another review names itself in both, and reads only its own fields and lists', async () => {
    const shape = { review: 'rental', fields: ['deposit'], lists: ['receipts'] } as const;
    const fetch = ok({
      ...sent,
      fields: { deposit: { value: 900, confidence: 'high', source: 'payslip' }, ...sent.fields },
      lists: { receipts: [{ values: { total: 900 }, confidence: 'high' }], contracts: [] },
      conflicts: [{ field: 'deposit', sources: ['payslip', 'other'] }],
    });
    const api = createApi(ENDPOINTS, fetch, shape);
    const result = await api.extract(request);
    await api.checkout('n'.repeat(32), 'turnstile');
    expect(fetch.calls[0]?.body).toEqual({ ...request, review: 'rental', quota: null });
    expect(fetch.calls[1]?.body).toEqual({
      nonce: 'n'.repeat(32),
      captchaToken: 'turnstile',
      returnTo: 'rental',
    });
    expect(result.ok && result.extraction).toEqual({
      pages: extraction.pages,
      documents: extraction.documents,
      fields: { deposit: { value: 900, confidence: 'high', source: 'payslip' } },
      receipts: [{ values: { total: 900 }, confidence: 'high' }],
      conflicts: [{ field: 'deposit', sources: ['payslip'] }],
    });
  });
  it('keeps the rental checks and each rental row’s source, and nothing it does not know', async () => {
    const shape = { review: 'rental', fields: [], lists: ['receipts'] } as const;
    const fetch = fakeFetch(200, {
      code: 'ok',
      extraction: {
        ...sent,
        lists: {
          receipts: [
            { values: { month: '2025-01' }, confidence: 'high', source: 'rent_receipt' },
            { values: { month: '2025-02' }, confidence: 'high', source: 'nowhere' },
          ],
        },
      },
      failedChecks: ['invoice_total_mismatch', 'return_before_keys', 'x'],
      allowance: 'q',
    });
    const result = await createApi(ENDPOINTS, fetch, shape).extract(request);
    expect(result.ok && result.failedChecks).toEqual([
      'invoice_total_mismatch',
      'return_before_keys',
    ]);
    expect(result.ok && result.extraction.receipts).toEqual([
      { values: { month: '2025-01' }, confidence: 'high', source: 'rent_receipt' },
      { values: { month: '2025-02' }, confidence: 'high' },
    ]);
  });
});

describe('an employment read', () => {
  it('names its review, keeps its checks and says when a list was cut', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      extraction: {
        ...sent,
        lists: {
          contracts: [
            { values: { startDate: '2024-01-01' }, confidence: 'high', source: 'work_history' },
          ],
        },
        truncated: true,
      },
      failedChecks: ['end_before_start', 'payslip_lines_do_not_sum', 'invoice_total_mismatch'],
      allowance: 'q',
    });
    const api = createApi(ENDPOINTS, fetch, EMPLOYMENT_EXTRACTION);
    const result = await api.extract(request);
    await api.checkout('n'.repeat(32), 'turnstile');
    expect(fetch.calls[0]?.body).toMatchObject({ review: 'employment' });
    expect(fetch.calls[1]?.body).toMatchObject({ returnTo: 'employment' });
    expect(result.ok && result.extraction.truncated).toBe(true);
    expect(result.ok && result.extraction.contracts).toHaveLength(1);
    expect(result.ok && result.failedChecks).toEqual([
      'end_before_start',
      'payslip_lines_do_not_sum',
      'invoice_total_mismatch',
    ]);
  });
  it('reads a list as whole unless the API says it was cut', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      extraction: { ...sent, truncated: 'yes' },
      failedChecks: [],
      allowance: 'q',
    });
    const result = await createApi(ENDPOINTS, fetch, EMPLOYMENT_EXTRACTION).extract(request);
    expect(result.ok && 'truncated' in result.extraction).toBe(false);
  });
});

describe('checkout and pass', () => {
  it('starts a checkout with the nonce', async () => {
    const fetch = fakeFetch(200, {
      code: 'ok',
      sessionId: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/1',
    });
    expect(await finalPayApi(fetch).checkout('n'.repeat(32), 'turnstile')).toEqual({
      ok: true,
      sessionId: 'cs_test_1',
      url: 'https://checkout.stripe.com/c/1',
    });
    expect(fetch.calls[0]).toEqual({
      url: 'https://checkout.api.test/',
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
    expect(await finalPayApi(fetch).pass('cs_test_1', 'n'.repeat(32))).toEqual({
      ok: true,
      pass: 'v1.p.s',
      expiresAt: 1_800_000_000,
      readsLeft: 15,
    });
    expect(fetch.calls[0]?.body).toEqual({ sessionId: 'cs_test_1', nonce: 'n'.repeat(32) });
  });
  it('a payment that is not complete is a failure with its code', async () => {
    const fetch = fakeFetch(402, { code: 'payment_not_complete' });
    expect(await finalPayApi(fetch).pass('cs_test_1', 'n')).toEqual({
      ok: false,
      code: 'payment_not_complete',
    });
  });
});

describe('verify', () => {
  it('posts only the pass to the pass function and returns its expiry and reads left', async () => {
    const fetch = fakeFetch(200, { code: 'ok', expiresAt: 1_800_000_000, readsLeft: 3 });
    expect(await finalPayApi(fetch).verify('v1.p.s')).toEqual({
      ok: true,
      expiresAt: 1_800_000_000,
      readsLeft: 3,
    });
    expect(fetch.calls[0]).toEqual({ url: 'https://pass.api.test/', body: { pass: 'v1.p.s' } });
  });
  it.each(['pass_invalid', 'pass_expired', 'pass_revoked'])(
    '%s comes back as such',
    async (code) => {
      expect(await finalPayApi(fakeFetch(403, { code })).verify('v1.p.s')).toEqual({
        ok: false,
        code,
      });
    },
  );
  it('an answer without its figures is never a yes', async () => {
    expect(await finalPayApi(fakeFetch(200, { code: 'ok' })).verify('v1.p.s')).toEqual({
      ok: false,
      code: 'unexpected_response',
    });
  });
});
