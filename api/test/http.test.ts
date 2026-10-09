import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { passClaims } from '../src/domain/allowance';
import { consoleLogger } from '../src/adapters/runtime';
import type { ExtractDeps } from '../src/domain/extract';
import type { HttpEvent } from '../src/http/common';
import { handleExtract } from '../src/http/extract';
import { tokenHash } from '../src/adapters/token-hash';
import { createVerifyMemo } from '../src/domain/payments';
import { handleCheckout, handlePass } from '../src/http/payments';
import { coherentSettlement, f, page, proposal } from './support/fields';
import {
  ESCALATION,
  FakeCaptcha,
  FakeCheckout,
  FakeClock,
  FakePayments,
  FakeReader,
  MemoryLogger,
  paidSession,
  PRIMARY,
  read,
} from './support/fakes';
import { jpeg } from './support/synthetic';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

const post = (body: unknown, method = 'POST'): HttpEvent => ({
  body: typeof body === 'string' ? body : JSON.stringify(body),
  isBase64Encoded: false,
  requestContext: { http: { method } },
});

const extractBody = (overrides: Record<string, unknown> = {}) => ({
  files: [{ mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400)) }],
  captchaToken: 'turnstile-token',
  ...overrides,
});

function extractDeps(toolInput: unknown = coherentSettlement()) {
  const logger = new MemoryLogger();
  const reader = new FakeReader({ [PRIMARY]: read(toolInput), [ESCALATION]: read(toolInput) });
  const deps: ExtractDeps & { logger: MemoryLogger } = {
    reader,
    captcha: new FakeCaptcha(),
    signer,
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models: { primary: PRIMARY, escalation: ESCALATION },
    logger,
  };
  return { deps, logger, reader };
}

const oversizedPdf = new Uint8Array(2 * 1024 * 1024 + 1).fill(0x20);
oversizedPdf.set(new TextEncoder().encode('%PDF-1.7\n'));

const json = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;

describe('handleExtract', () => {
  it('decodes the files and answers with the extraction and the next allowance', async () => {
    const { deps, reader } = extractDeps();
    const response = await handleExtract(post(extractBody()), deps);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = json(response);
    expect(body).toMatchObject({ code: 'ok', failedChecks: [] });
    expect(body['extraction']).toMatchObject({
      documents: [{ kind: 'settlement_proposal', pages: [1] }],
      fields: { extra_pay: { ...f(980), source: 'settlement_proposal' } },
      conflicts: [],
    });
    expect(signer.verify(body['allowance'] as string)).toMatchObject({ typ: 'quota', used: 1 });
    expect(reader.calls[0]?.files[0]?.bytes).toEqual(jpeg(1000, 1400));
  });

  it('says whether the read escalated, which carries nothing about the person', async () => {
    const confident = extractDeps();
    expect(json(await handleExtract(post(extractBody()), confident.deps))).toMatchObject({
      code: 'ok',
      escalated: false,
    });
    const doubtful = extractDeps(coherentSettlement('low'));
    expect(json(await handleExtract(post(extractBody()), doubtful.deps))).toMatchObject({
      code: 'ok',
      escalated: true,
    });
  });

  it('keeps escalated out of error answers', async () => {
    const { deps } = extractDeps();
    expect(json(await handleExtract(post(extractBody({ captchaToken: '' })), deps))).toEqual({
      code: 'invalid_request',
    });
  });

  it('accepts a base64-encoded event body', async () => {
    const { deps } = extractDeps();
    const event = {
      ...post(''),
      body: Buffer.from(JSON.stringify(extractBody())).toString('base64'),
      isBase64Encoded: true,
    };
    expect((await handleExtract(event, deps)).statusCode).toBe(200);
  });

  it.each([
    ['a GET', post(extractBody(), 'GET'), 405, 'method_not_allowed'],
    ['broken JSON', post('{"files":'), 400, 'invalid_request'],
    ['a JSON array', post('[]'), 400, 'invalid_request'],
    ['files that are not a list', post(extractBody({ files: 'x' })), 400, 'invalid_request'],
    ['no captcha token', post(extractBody({ captchaToken: '' })), 400, 'invalid_request'],
    ['an unknown review', post(extractBody({ review: 'tenancy' })), 400, 'invalid_request'],
    ['a review that is no string', post(extractBody({ review: 1 })), 400, 'invalid_request'],
    [
      'a PDF, which the browser sends as page images',
      post(extractBody({ files: [{ mediaType: 'application/pdf', data: '' }] })),
      415,
      'unsupported_media_type',
    ],
    [
      'a PNG',
      post(extractBody({ files: [{ mediaType: 'image/png', data: '' }] })),
      415,
      'unsupported_media_type',
    ],
    [
      'data that is not base64',
      post(extractBody({ files: [{ mediaType: 'image/jpeg', data: 'a?b=' }] })),
      400,
      'invalid_request',
    ],
    [
      'twenty-six files',
      post(extractBody({ files: Array(26).fill({ mediaType: 'image/jpeg', data: '' }) })),
      422,
      'too_many_files',
    ],
    [
      'an image over 1568 px',
      post(extractBody({ files: [{ mediaType: 'image/jpeg', data: b64(jpeg(2000, 1500)) }] })),
      422,
      'image_too_large',
    ],
    ['a forged pass', post(extractBody({ pass: 'v1.abc.def' })), 403, 'pass_invalid'],
    [
      'a body over 6 MB',
      post(`{"pad":"${'a'.repeat(6 * 1024 * 1024)}"}`),
      413,
      'payload_too_large',
    ],
  ])('answers %s with a code', async (_, event, status, code) => {
    const { deps, reader } = extractDeps();
    const response = await handleExtract(event, deps);
    expect(response.statusCode).toBe(status);
    expect(json(response)).toEqual({ code });
    expect(reader.calls).toEqual([]);
  });

  it('turns an unexpected failure into a code', async () => {
    const { deps } = extractDeps();
    const broken = { ...deps, captcha: { verify: () => Promise.reject(new Error('boom')) } };
    const response = await handleExtract(post(extractBody()), broken);
    expect(response.statusCode).toBe(503);
    expect(json(response)).toEqual({ code: 'service_unavailable' });
  });

  it('logs one line per request with only codes and counts', async () => {
    const { deps, logger } = extractDeps(coherentSettlement('low'));
    await handleExtract(post(extractBody()), deps);
    expect(logger.events).toEqual([
      {
        op: 'extract',
        code: 'ok',
        latencyMs: 0,
        pages: 1,
        inputTokens: 2000,
        outputTokens: 400,
        escalated: true,
        retried: false,
        conflicts: 0,
      },
    ]);
  });
});

describe('the review a read is for', () => {
  it('reads as the final pay and logs no review when the request names none', async () => {
    const { deps, logger, reader } = extractDeps();
    await handleExtract(post(extractBody()), deps);
    expect(reader.calls.map((c) => c.review)).toEqual(['final_pay']);
    expect(logger.events[0]).not.toHaveProperty('review');
  });

  it('logs the review a request names', async () => {
    const { deps, logger } = extractDeps();
    await handleExtract(post(extractBody({ review: 'final_pay' })), deps);
    expect(logger.events[0]).toMatchObject({ code: 'ok', review: 'final_pay' });
  });

  it('reads a rental pack as one and logs only that it was one', async () => {
    const { deps, logger, reader } = extractDeps({
      pages: [page(1, 'lease')],
      lease: { signedOn: f('2024-05-20'), initialRent: f(98765.43) },
    });
    const response = await handleExtract(post(extractBody({ review: 'rental' })), deps);
    expect(json(response)).toMatchObject({
      code: 'ok',
      extraction: { fields: { initialRent: { value: 98765.43, source: 'lease' } } },
    });
    expect(reader.calls.map((c) => c.review)).toEqual(['rental']);
    expect(logger.events).toEqual([
      {
        op: 'extract',
        code: 'ok',
        latencyMs: 0,
        pages: 1,
        inputTokens: 1000,
        outputTokens: 200,
        escalated: false,
        retried: false,
        conflicts: 0,
        review: 'rental',
      },
    ]);
    expect(JSON.stringify(logger.events)).not.toMatch(/98765|2024-05-20/);
  });

  it('reads an employment pack as one and logs only that it was one', async () => {
    const { deps, logger, reader } = extractDeps({
      pages: [page(1, 'employment_contract')],
      employment_contract: {
        startDate: f('2026-10-07'),
        salaryAmount: f(98765.43),
        causeText: f('Campaña de verano'),
      },
    });
    const response = await handleExtract(post(extractBody({ review: 'employment' })), deps);
    expect(json(response)).toMatchObject({
      code: 'ok',
      extraction: {
        fields: { salaryAmount: { value: 98765.43, source: 'employment_contract' } },
        truncated: false,
      },
    });
    expect(reader.calls.map((c) => c.review)).toEqual(['employment']);
    expect(logger.events).toEqual([
      {
        op: 'extract',
        code: 'ok',
        latencyMs: 0,
        pages: 1,
        inputTokens: 1000,
        outputTokens: 200,
        escalated: false,
        retried: false,
        conflicts: 0,
        review: 'employment',
      },
    ]);
    expect(JSON.stringify(logger.events)).not.toMatch(/98765|2026-10-07|Campaña/);
  });

  it.each([
    ['credit', 'credit_agreement', 'agreedOn', 'principal', 'Comisión de apertura'],
    ['insurance', 'insurance_policy', 'expiresOn', 'premiumTotal', 'Continente'],
  ] as const)(
    'reads a %s pack as one and logs only that it was one',
    async (review, section, day, field, concept) => {
      const list = review === 'credit' ? 'charges' : 'sumsInsured';
      const item =
        review === 'credit'
          ? { kind: 'opening', concept, amount: 761.25, confidence: 'high' }
          : { kind: 'building', concept, amount: 150000, confidence: 'high' };
      const { deps, logger, reader } = extractDeps({
        pages: [page(1, section)],
        [section]: { [day]: f('2026-10-07'), [field]: f(98765.43), [list]: [item] },
      });
      const response = await handleExtract(post(extractBody({ review })), deps);
      expect(json(response)).toMatchObject({
        code: 'ok',
        extraction: { fields: { [field]: { value: 98765.43, source: section } } },
      });
      expect(reader.calls.map((c) => c.review)).toEqual([review]);
      expect(logger.events).toEqual([
        {
          op: 'extract',
          code: 'ok',
          latencyMs: 0,
          pages: 1,
          inputTokens: 1000,
          outputTokens: 200,
          escalated: false,
          retried: false,
          conflicts: 0,
          review,
        },
      ]);
      expect(JSON.stringify(logger.events)).not.toMatch(/98765|2026-10-07|Comisión|Continente/);
    },
  );

  it('refuses a review it does not know', async () => {
    const { deps, reader } = extractDeps();
    const response = await handleExtract(post(extractBody({ review: 'contract' })), deps);
    expect(json(response)).toEqual({ code: 'invalid_request' });
    expect(reader.calls).toEqual([]);
  });
});

describe('a read that found nothing', () => {
  it('answers with each page’s reason and no values, and logs only the counts', async () => {
    const { deps, logger } = extractDeps({
      pages: [page(1, 'payslip', 1, 'high', undefined, 'blurry'), page(2, 'other')],
    });
    const response = await handleExtract(
      post(
        extractBody({
          files: [
            { mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400)) },
            { mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400)) },
          ],
        }),
      ),
      deps,
    );
    expect(response.statusCode).toBe(422);
    expect(json(response)).toEqual({
      code: 'nothing_read',
      pages: [
        { page: 1, kind: 'payslip', readability: f('blurry') },
        { page: 2, kind: 'other', readability: f('ok') },
      ],
    });
    expect(logger.events).toEqual([
      expect.objectContaining({ code: 'nothing_read', readability: { blurry: 1, ok: 1 } }),
    ]);
  });
});

describe('flags in the log line', () => {
  it('marks a pass read whose count Stripe failed to store, with nothing about the person', async () => {
    const { deps, logger } = extractDeps();
    const pass = signer.sign(passClaims('cs_test_paid', Date.UTC(2026, 9, 13) / 1000));
    const response = await handleExtract(post(extractBody({ pass })), {
      ...deps,
      payments: new FakePayments({ cs_test_paid: paidSession() }, 'record'),
    });
    expect(json(response)).toMatchObject({ code: 'ok', readsLeft: 14 });
    expect(logger.events).toEqual([
      {
        op: 'extract',
        code: 'ok',
        latencyMs: 0,
        pages: 1,
        inputTokens: 1000,
        outputTokens: 200,
        escalated: false,
        retried: false,
        conflicts: 0,
        countNotSaved: true,
      },
    ]);
  });
});

describe('logs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never contain extracted values, document content, tokens or identifiers', async () => {
    const lines: string[] = [];
    for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const)
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(' '));
      });
    const sentinels = {
      document: 'SENTINEL-DOCUMENT-TEXT',
      captcha: 'SENTINEL-CAPTCHA-TOKEN',
      date: '2031-07-19',
      amount: 98765.43,
      nonce: 'SENTINEL-nonce-0123456789',
      session: 'cs_test_SENTINELSESSION',
    };
    // Two documents that disagree: the log may say that they do, never on what.
    const { deps } = extractDeps({
      ...coherentSettlement(),
      settlement_proposal: {
        ...proposal(),
        endDate: f(sentinels.date),
        severance: f(sentinels.amount),
        note: f('SENTINEL-INJECTED-FIELD'),
      },
      pages: [page(1, 'settlement_proposal'), page(2, 'dismissal_letter')],
      dismissal_letter: { endDate: f('2031-07-20'), severance: f(1) },
    });
    const quota = signer.sign({ typ: 'quota', day: '2026-10-07', used: 0 });
    const extracted = await handleExtract(
      post(
        extractBody({
          files: [
            { mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400, sentinels.document)) },
            { mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400)) },
          ],
          captchaToken: sentinels.captcha,
          quota,
        }),
      ),
      { ...deps, logger: consoleLogger },
    );
    const next = json(extracted)['allowance'] as string;
    expect(json(extracted)['extraction']).toMatchObject({
      conflicts: [
        { field: 'endDate', sources: ['settlement_proposal', 'dismissal_letter'] },
        { field: 'severance', sources: ['settlement_proposal', 'dismissal_letter'] },
      ],
    });

    // A PDF is refused before anything reads it: the browser sends its pages as images.
    const pdfBytes = new TextEncoder().encode(`%PDF-1.7\n(${sentinels.document})\n%%EOF`);
    const refused = await handleExtract(
      post(
        extractBody({
          files: [{ mediaType: 'application/pdf', data: b64(pdfBytes) }],
          captchaToken: sentinels.captcha,
        }),
      ),
      { ...deps, logger: consoleLogger },
    );
    expect(json(refused)).toEqual({ code: 'unsupported_media_type' });

    await handleCheckout(post({ nonce: sentinels.nonce, captchaToken: sentinels.captcha }), {
      checkout: new FakeCheckout(),
      captcha: new FakeCaptcha(),
      logger: consoleLogger,
      clock: new FakeClock(),
    });
    const pass = await handlePass(post({ sessionId: sentinels.session, nonce: sentinels.nonce }), {
      payments: new FakePayments({}),
      signer,
      clock: new FakeClock(),
      priceId: 'price_test',
      logger: consoleLogger,
      memo: createVerifyMemo(),
      hash: tokenHash,
    });
    expect(json(pass)).toEqual({ code: 'session_not_found' });
    const verified = await handlePass(post({ pass: sentinels.session }), {
      payments: new FakePayments({}),
      signer,
      clock: new FakeClock(),
      priceId: 'price_test',
      logger: consoleLogger,
      memo: createVerifyMemo(),
      hash: tokenHash,
    });
    expect(json(verified)).toEqual({ code: 'pass_invalid' });

    expect(lines).toHaveLength(5);
    const allowed = [
      'op',
      'code',
      'latencyMs',
      'pages',
      'inputTokens',
      'outputTokens',
      'escalated',
      'retried',
      'conflicts',
      'readability',
      'review',
      'verify',
    ];
    for (const line of lines) {
      for (const key of Object.keys(JSON.parse(line) as object)) expect(allowed).toContain(key);
      for (const secret of [
        ...Object.values(sentinels).map(String),
        quota,
        next,
        'SENTINEL',
        '98765',
        'cs_test',
      ])
        expect(line).not.toContain(secret);
    }
  });
});

describe('payment handlers', () => {
  const deps = () => ({
    checkout: new FakeCheckout(),
    captcha: new FakeCaptcha(),
    logger: new MemoryLogger(),
    clock: new FakeClock(),
  });

  it('starts a checkout for a well-formed nonce and captcha token', async () => {
    const response = await handleCheckout(
      post({ nonce: 'n0nce-generated-by-the-browser', captchaToken: 'turnstile-token' }),
      deps(),
    );
    expect(response.statusCode).toBe(200);
    expect(json(response)).toMatchObject({
      code: 'ok',
      sessionId: expect.stringMatching(/^cs_test_/),
    });
  });

  it.each([
    { captchaToken: 't' },
    { nonce: 'short', captchaToken: 't' },
    { nonce: 'has spaces in it and is long enough', captchaToken: 't' },
    { nonce: 'n0nce-generated-by-the-browser' },
    { nonce: 'n0nce-generated-by-the-browser', captchaToken: 't', returnTo: 'final_pay' },
    { nonce: 'n0nce-generated-by-the-browser', captchaToken: 't', returnTo: '/alquiler/' },
    { nonce: 'n0nce-generated-by-the-browser', captchaToken: 't', returnTo: '/contrato/' },
    { nonce: 'n0nce-generated-by-the-browser', captchaToken: 't', returnTo: null },
  ])('refuses a malformed request %j', async (body) => {
    expect(json(await handleCheckout(post(body), deps()))).toEqual({ code: 'invalid_request' });
  });

  it('sends a checkout back to the page it came from, the final pay when it names none', async () => {
    const checkout = new FakeCheckout();
    const body = { nonce: 'n0nce-generated-by-the-browser', captchaToken: 'turnstile-token' };
    await handleCheckout(post(body), { ...deps(), checkout });
    await handleCheckout(post({ ...body, returnTo: 'rental' }), { ...deps(), checkout });
    await handleCheckout(post({ ...body, returnTo: 'employment' }), { ...deps(), checkout });
    expect(checkout.returns).toEqual(['final_pay', 'rental', 'employment']);
  });

  it('sends a credit checkout back to its page and starts none from the insurance review', async () => {
    const checkout = new FakeCheckout();
    const body = { nonce: 'n0nce-generated-by-the-browser', captchaToken: 'turnstile-token' };
    await handleCheckout(post({ ...body, returnTo: 'credit' }), { ...deps(), checkout });
    expect(checkout.returns).toEqual(['credit']);
    const refused = await handleCheckout(post({ ...body, returnTo: 'insurance' }), {
      ...deps(),
      checkout,
    });
    expect(json(refused)).toEqual({ code: 'invalid_request' });
    expect(checkout.returns).toEqual(['credit']);
  });

  it('refuses a malformed session id', async () => {
    const response = await handlePass(
      post({ sessionId: 'pi_123', nonce: 'n0nce-generated-by-the-browser' }),
      {
        payments: new FakePayments({}),
        signer,
        clock: new FakeClock(),
        priceId: 'price_test',
        logger: new MemoryLogger(),
        memo: createVerifyMemo(),
        hash: tokenHash,
      },
    );
    expect(json(response)).toEqual({ code: 'invalid_request' });
  });

  describe('verifying a pass', () => {
    const verify = (body: unknown, session = paidSession()) => {
      const logger = new MemoryLogger();
      return handlePass(post(body), {
        payments: new FakePayments({ [session.id]: session }),
        signer,
        clock: new FakeClock(),
        priceId: 'price_test',
        logger,
        memo: createVerifyMemo(),
        hash: tokenHash,
      }).then((r) => ({ r, logger }));
    };
    const token = signer.sign(passClaims(paidSession().id, paidSession().created + 7 * 86_400));

    it('answers with its expiry and reads left, and logs it as a verify', async () => {
      const { r, logger } = await verify({ pass: token });
      expect(r.statusCode).toBe(200);
      expect(json(r)).toEqual({
        code: 'ok',
        expiresAt: paidSession().created + 7 * 86_400,
        readsLeft: 15,
      });
      expect(logger.events[0]).toMatchObject({ op: 'pass', code: 'ok', verify: true });
    });

    it.each([
      [{ pass: '' }],
      [{ pass: 42 }],
      [{ pass: 'x'.repeat(2049) }],
      [{ pass: token, sessionId: paidSession().id }],
    ])('refuses a malformed verify %j', async (body) => {
      expect(json((await verify(body)).r)).toEqual({ code: 'invalid_request' });
    });
  });
});
