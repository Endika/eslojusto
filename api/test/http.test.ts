import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { pdfInspector } from '../src/adapters/pdf-inspector';
import { consoleLogger } from '../src/adapters/runtime';
import type { ExtractDeps } from '../src/domain/extract';
import type { HttpEvent } from '../src/http/common';
import { handleExtract } from '../src/http/extract';
import { handleCheckout, handlePass } from '../src/http/payments';
import { coherentSettlement, f } from './support/fields';
import {
  ESCALATION,
  FakeCaptcha,
  FakeCheckout,
  FakeClock,
  FakePayments,
  FakeReader,
  MemoryLogger,
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
  kind: 'settlement',
  files: [{ mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400)) }],
  captchaToken: 'turnstile-token',
  ...overrides,
});

function extractDeps(toolInput: unknown = coherentSettlement()) {
  const logger = new MemoryLogger();
  const reader = new FakeReader({ [PRIMARY]: read(toolInput), [ESCALATION]: read(toolInput) });
  const deps: ExtractDeps & { logger: MemoryLogger } = {
    reader,
    pdf: pdfInspector,
    captcha: new FakeCaptcha(),
    signer,
    clock: new FakeClock(),
    models: { primary: PRIMARY, escalation: ESCALATION },
    logger,
  };
  return { deps, logger, reader };
}

const json = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;

describe('handleExtract', () => {
  it('decodes the files and answers with the extraction and the next allowance', async () => {
    const { deps, reader } = extractDeps();
    const response = await handleExtract(post(extractBody()), deps);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const body = json(response);
    expect(body).toMatchObject({ code: 'ok', failedChecks: [] });
    expect(body['extraction']).toMatchObject({ kind: 'settlement', fields: { extra_pay: f(980) } });
    expect(signer.verify(body['allowance'] as string)).toMatchObject({ typ: 'quota', used: 1 });
    expect(reader.calls[0]?.files[0]?.bytes).toEqual(jpeg(1000, 1400));
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
    ['broken JSON', post('{"kind":'), 400, 'invalid_request'],
    ['a JSON array', post('[]'), 400, 'invalid_request'],
    ['an unknown kind', post(extractBody({ kind: 'contract' })), 400, 'invalid_request'],
    ['no captcha token', post(extractBody({ captchaToken: '' })), 400, 'invalid_request'],
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
      'five files',
      post(extractBody({ files: Array(5).fill({ mediaType: 'image/jpeg', data: '' }) })),
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
      },
    ]);
  });
});

describe('logs', () => {
  afterEach(() => vi.restoreAllMocks());

  it('never contain extracted values, document content, tokens or identifiers', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    const sentinels = {
      document: 'SENTINEL-DOCUMENT-TEXT',
      captcha: 'SENTINEL-CAPTCHA-TOKEN',
      date: '2031-07-19',
      amount: 98765.43,
      nonce: 'SENTINEL-nonce-0123456789',
      session: 'cs_test_SENTINELSESSION',
    };
    const { deps } = extractDeps({
      ...coherentSettlement(),
      endDate: f(sentinels.date),
      severance: f(sentinels.amount),
      note: f('SENTINEL-INJECTED-FIELD'),
    });
    const quota = signer.sign({ typ: 'quota', day: '2026-10-07', used: 0 });
    const extracted = await handleExtract(
      post(
        extractBody({
          files: [{ mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400, sentinels.document)) }],
          captchaToken: sentinels.captcha,
          quota,
        }),
      ),
      { ...deps, logger: consoleLogger },
    );
    const next = json(extracted)['allowance'] as string;

    await handleCheckout(post({ nonce: sentinels.nonce }), {
      checkout: new FakeCheckout(),
      logger: consoleLogger,
      clock: new FakeClock(),
    });
    const pass = await handlePass(post({ sessionId: sentinels.session, nonce: sentinels.nonce }), {
      payments: new FakePayments({}),
      signer,
      clock: new FakeClock(),
      priceId: 'price_test',
      logger: consoleLogger,
    });
    expect(json(pass)).toEqual({ code: 'session_not_found' });

    expect(lines).toHaveLength(3);
    const allowed = [
      'op',
      'code',
      'latencyMs',
      'pages',
      'inputTokens',
      'outputTokens',
      'escalated',
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
    logger: new MemoryLogger(),
    clock: new FakeClock(),
  });

  it('starts a checkout for a well-formed nonce', async () => {
    const response = await handleCheckout(
      post({ nonce: 'n0nce-generated-by-the-browser' }),
      deps(),
    );
    expect(response.statusCode).toBe(200);
    expect(json(response)).toMatchObject({
      code: 'ok',
      sessionId: expect.stringMatching(/^cs_test_/),
    });
  });

  it.each([{}, { nonce: 'short' }, { nonce: 'has spaces in it and is long enough' }])(
    'refuses a malformed nonce %j',
    async (body) => {
      expect(json(await handleCheckout(post(body), deps()))).toEqual({ code: 'invalid_request' });
    },
  );

  it('refuses a malformed session id', async () => {
    const response = await handlePass(
      post({ sessionId: 'pi_123', nonce: 'n0nce-generated-by-the-browser' }),
      {
        payments: new FakePayments({}),
        signer,
        clock: new FakeClock(),
        priceId: 'price_test',
        logger: new MemoryLogger(),
      },
    );
    expect(json(response)).toEqual({ code: 'invalid_request' });
  });
});
