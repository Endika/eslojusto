import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { pdfInspector } from '../src/adapters/pdf-inspector';
import { HAIKU_4_5, SONNET_4_6 } from '../src/config';
import { passClaims } from '../src/domain/allowance';
import type { DocumentFile } from '../src/domain/documents';
import {
  extract,
  type ExtractDeps,
  type ExtractMetrics,
  type ExtractRequest,
} from '../src/domain/extract';
import type { PdfInspector, SessionSnapshot } from '../src/domain/ports';
import { MAX_ESCALATION_INPUT_TOKENS } from '../src/domain/tokens';
import { coherentSettlement, f } from './support/fields';
import {
  ESCALATION,
  FakeCaptcha,
  FakeClock,
  FakePayments,
  FakeReader,
  paidSession,
  PRIMARY,
  read,
} from './support/fakes';
import { recordedReader } from './support/recorded';
import { INJECTION, jpeg, settlementPdf } from './support/synthetic';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};
const PASS_EXP = Date.UTC(2026, 9, 13, 12) / 1000;
const passToken = (sid = 'cs_test_paid') => signer.sign(passClaims(sid, PASS_EXP));

class CountingInspector implements PdfInspector {
  calls = 0;
  constructor(private readonly facts: Awaited<ReturnType<PdfInspector['inspect']>>) {}
  async inspect() {
    this.calls += 1;
    return this.facts;
  }
}

function setup(
  answers: ConstructorParameters<typeof FakeReader>[0],
  options: {
    captchaOk?: boolean;
    sessions?: Record<string, SessionSnapshot>;
    pdf?: PdfInspector;
  } = {},
) {
  const reader = new FakeReader(answers);
  const captcha = new FakeCaptcha(options.captchaOk ?? true);
  const payments = new FakePayments(options.sessions ?? { cs_test_paid: paidSession() });
  const deps: ExtractDeps = {
    reader,
    pdf: options.pdf ?? pdfInspector,
    captcha,
    signer,
    payments,
    clock: new FakeClock(),
    models: { primary: PRIMARY, escalation: ESCALATION },
  };
  return { reader, captcha, payments, deps };
}

const request = (overrides: Partial<ExtractRequest> = {}): ExtractRequest => ({
  kind: 'settlement',
  files: [photo],
  captchaToken: 'turnstile-token',
  allowance: { type: 'free', token: null },
  ...overrides,
});

describe('extract', () => {
  it('returns a confident, coherent primary read without escalating', async () => {
    const { reader, deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    const metrics: ExtractMetrics = {};
    const response = await extract(request(), deps, metrics);
    expect(response.code).toBe('ok');
    if (response.code !== 'ok') return;
    expect(response.extraction.fields['totalAccrued']).toEqual(f(2870.5));
    expect(response.failedChecks).toEqual([]);
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY]);
    expect(metrics).toEqual({ pages: 1, inputTokens: 1000, outputTokens: 200, escalated: false });
  });

  it.each([
    ['a low-confidence field', coherentSettlement('low')],
    ['items that do not add up', { ...coherentSettlement(), totalAccrued: f(9000) }],
    ['an impossible date', { ...coherentSettlement(), endDate: f('2026-02-30') }],
    ['an end date before the start', { ...coherentSettlement(), endDate: f('2020-01-01') }],
    ['no tool output', null],
    ['no detected kind', { startDate: f('2022-03-01') }],
  ])('escalates on %s and the escalation read wins', async (_, primaryInput) => {
    const { reader, deps } = setup({
      [PRIMARY]: read(primaryInput),
      [ESCALATION]: read({ ...coherentSettlement(), severance: f(321) }, 2000, 300),
    });
    const metrics: ExtractMetrics = {};
    const response = await extract(request(), deps, metrics);
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY, ESCALATION]);
    expect(response.code).toBe('ok');
    if (response.code === 'ok') expect(response.extraction.fields['severance']).toEqual(f(321));
    expect(metrics.escalated).toBe(true);
    expect(metrics.inputTokens).toBe(3000);
  });

  it('keeps a usable primary read when the escalation read has nothing to say', async () => {
    const { deps } = setup({
      [PRIMARY]: read(coherentSettlement('low')),
      [ESCALATION]: read(null),
    });
    const response = await extract(request(), deps, {});
    expect(response.code === 'ok' && response.extraction.fields['startDate']).toEqual(
      f('2022-03-01', 'low'),
    );
  });

  it('keeps the escalated read even when it is still doubtful', async () => {
    const { deps } = setup({
      [PRIMARY]: read(coherentSettlement('low')),
      [ESCALATION]: read({ ...coherentSettlement(), totalAccrued: f(1) }),
    });
    const response = await extract(request(), deps, {});
    expect(response.code === 'ok' && response.failedChecks).toEqual(['items_do_not_sum']);
  });

  it('does not escalate when both constants name the same model', async () => {
    const { reader, deps } = setup({ [PRIMARY]: read(coherentSettlement('low')) });
    const metrics: ExtractMetrics = {};
    await extract(
      request(),
      { ...deps, models: { primary: PRIMARY, escalation: PRIMARY } },
      metrics,
    );
    expect(reader.calls).toHaveLength(1);
    expect(metrics.escalated).toBe(false);
  });

  it('never escalates a read whose input was over the escalation cap', async () => {
    const { reader, deps } = setup({
      [PRIMARY]: read(coherentSettlement('low'), MAX_ESCALATION_INPUT_TOKENS + 1),
      [ESCALATION]: read(coherentSettlement()),
    });
    const metrics: ExtractMetrics = {};
    const response = await extract(request(), deps, metrics);
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY]);
    expect(metrics.escalated).toBe(false);
    expect(response.code).toBe('ok');
  });

  it('falls back to the primary read if the escalation call fails', async () => {
    const { deps } = setup({
      [PRIMARY]: read(coherentSettlement('low')),
      [ESCALATION]: new Error('throttled'),
    });
    const response = await extract(request(), deps, {});
    expect(response.code === 'ok' && response.extraction.fields['startDate']).toEqual(
      f('2022-03-01', 'low'),
    );
  });

  it('tries the escalation model when the primary model fails', async () => {
    const { reader, deps } = setup({
      [PRIMARY]: new Error('ValidationException: model end of life'),
      [ESCALATION]: read(coherentSettlement()),
    });
    const metrics: ExtractMetrics = {};
    expect((await extract(request(), deps, metrics)).code).toBe('ok');
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY, ESCALATION]);
    expect(metrics.escalated).toBe(true);
  });

  it('reports the model as unavailable when both fail', async () => {
    const { deps } = setup({ [PRIMARY]: new Error('down'), [ESCALATION]: new Error('down') });
    expect(await extract(request(), deps, {})).toEqual({ code: 'model_unavailable' });
  });

  it('answers a confident wrong kind of document without escalating or returning data', async () => {
    const { reader, deps } = setup({
      [PRIMARY]: read({ detectedKind: f('payslip'), totalAccrued: f(1980) }),
    });
    expect(await extract(request(), deps, {})).toEqual({ code: 'document_kind_mismatch' });
    expect(reader.calls).toHaveLength(1);
  });

  it('escalates an unsure wrong kind', async () => {
    const { reader, deps } = setup({
      [PRIMARY]: read({ detectedKind: f('payslip', 'low') }),
      [ESCALATION]: read(coherentSettlement()),
    });
    expect((await extract(request(), deps, {})).code).toBe('ok');
    expect(reader.calls).toHaveLength(2);
  });

  it('reports an unreadable document when neither model records anything', async () => {
    const { deps } = setup({ [PRIMARY]: read(null), [ESCALATION]: read(null) });
    expect(await extract(request(), deps, {})).toEqual({ code: 'document_unreadable' });
  });

  it('checks shapes and the allowance before the captcha, and nothing reaches a model', async () => {
    const { reader, captcha, deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    expect((await extract(request({ files: [] }), deps, {})).code).toBe('no_files');
    expect(
      (await extract(request({ allowance: { type: 'pass', token: 'forged' } }), deps, {})).code,
    ).toBe('pass_invalid');
    expect(captcha.tokens).toEqual([]);
    expect(reader.calls).toEqual([]);
  });

  it('verifies the captcha before parsing any image or PDF', async () => {
    const inspector = new CountingInspector({ pages: 1, textBytes: 0 });
    const pdf: DocumentFile = { mediaType: 'application/pdf', bytes: await settlementPdf(1) };
    const rejecting = setup({}, { captchaOk: false, pdf: inspector });
    expect(await extract(request({ files: [pdf] }), rejecting.deps, {})).toEqual({
      code: 'captcha_failed',
    });
    expect(inspector.calls).toBe(0);
    // An oversized image is only noticed once the captcha has passed.
    const huge: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(4000, 3000) };
    expect((await extract(request({ files: [huge] }), rejecting.deps, {})).code).toBe(
      'captcha_failed',
    );
    const accepting = setup({});
    expect((await extract(request({ files: [huge] }), accepting.deps, {})).code).toBe(
      'image_too_large',
    );
  });

  it('counts PDF pages and refuses more than four', async () => {
    const { reader, deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    const four: DocumentFile = { mediaType: 'application/pdf', bytes: await settlementPdf(4) };
    const five: DocumentFile = { mediaType: 'application/pdf', bytes: await settlementPdf(5) };
    const metrics: ExtractMetrics = {};
    expect((await extract(request({ files: [four] }), deps, metrics)).code).toBe('ok');
    expect(metrics.pages).toBe(4);
    expect(await extract(request({ files: [five] }), deps, {})).toEqual({
      code: 'pdf_too_many_pages',
    });
    expect(reader.calls).toHaveLength(1);
  });

  it('refuses the PDF that hides four of its five pages from a sequential parser', async () => {
    const { reader, deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    const bytes = new Uint8Array(
      readFileSync(new URL('fixtures/pdf/five-pages-counted-as-one.pdf', import.meta.url)),
    );
    expect(
      await extract(request({ files: [{ mediaType: 'application/pdf', bytes }] }), deps, {}),
    ).toEqual({ code: 'pdf_unreadable' });
    expect(reader.calls).toEqual([]);
  });

  it('refuses a document too dense to read at a bounded cost', async () => {
    const pdf: DocumentFile = { mediaType: 'application/pdf', bytes: await settlementPdf(4) };
    const { reader, deps } = setup(
      { [PRIMARY]: read(coherentSettlement()) },
      { pdf: new CountingInspector({ pages: 4, textBytes: 60_000 }) },
    );
    expect(await extract(request({ files: [pdf] }), deps, {})).toEqual({
      code: 'document_too_dense',
    });
    expect(reader.calls).toEqual([]);
  });

  it('hands back a quota token counting the read', async () => {
    const { deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    const first = await extract(request(), deps, {});
    if (first.code !== 'ok' || !first.allowanceToken) throw new Error(first.code);
    expect(signer.verify(first.allowanceToken)).toEqual({
      typ: 'quota',
      day: '2026-10-07',
      used: 1,
    });
    const second = await extract(
      request({ allowance: { type: 'free', token: first.allowanceToken } }),
      deps,
      {},
    );
    if (second.code !== 'ok' || !second.allowanceToken) throw new Error(second.code);
    const third = await extract(
      request({ allowance: { type: 'free', token: second.allowanceToken } }),
      deps,
      {},
    );
    expect(third).toEqual({ code: 'daily_limit_reached' });
  });

  it('does not count a read that failed', async () => {
    const { deps } = setup({ [PRIMARY]: new Error('down'), [ESCALATION]: new Error('down') });
    const token = signer.sign({ typ: 'quota', day: '2026-10-07', used: 1 });
    expect((await extract(request({ allowance: { type: 'free', token } }), deps, {})).code).toBe(
      'model_unavailable',
    );
  });
});

describe('extract with a pass', () => {
  const pass = (sessions: Record<string, SessionSnapshot>) =>
    setup(
      { [PRIMARY]: read(coherentSettlement('low')), [ESCALATION]: read(coherentSettlement()) },
      { sessions },
    );

  it('takes the same path as a free read and counts the read in Stripe', async () => {
    const { reader, payments, deps } = pass({ cs_test_paid: paidSession({ readsUsed: 3 }) });
    const response = await extract(
      request({ allowance: { type: 'pass', token: passToken() } }),
      deps,
      {},
    );
    expect(response).toMatchObject({ code: 'ok', readsLeft: 11 });
    expect(response).not.toHaveProperty('allowanceToken');
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY, ESCALATION]);
    expect(payments.recorded).toEqual([{ sessionId: 'cs_test_paid', readsUsed: 4 }]);
  });

  it('stops at fifteen reads however often the pass is re-issued', async () => {
    const { payments, deps } = pass({ cs_test_paid: paidSession({ readsUsed: 14 }) });
    const allowance = { type: 'pass' as const, token: passToken() };
    expect(await extract(request({ allowance }), deps, {})).toMatchObject({ readsLeft: 0 });
    expect(await extract(request({ allowance }), deps, {})).toEqual({ code: 'pass_exhausted' });
    expect(payments.recorded).toHaveLength(1);
  });

  it.each([
    ['a refunded or disputed payment', paidSession({ revoked: true }), 'pass_revoked'],
    [
      'a session that is no longer paid',
      paidSession({ paymentStatus: 'unpaid' }),
      'payment_not_complete',
    ],
  ])('refuses %s before any model read', async (_, session, code) => {
    const { reader, deps } = pass({ cs_test_paid: session });
    expect(
      await extract(request({ allowance: { type: 'pass', token: passToken() } }), deps, {}),
    ).toEqual({ code });
    expect(reader.calls).toEqual([]);
  });

  it('refuses a pass for a session Stripe does not know, or when Stripe is down', async () => {
    const unknown = pass({});
    expect(
      await extract(request({ allowance: { type: 'pass', token: passToken() } }), unknown.deps, {}),
    ).toEqual({ code: 'pass_invalid' });
    const down = setup({}, {});
    const deps = { ...down.deps, payments: new FakePayments({}, 'find') };
    expect(
      await extract(request({ allowance: { type: 'pass', token: passToken() } }), deps, {}),
    ).toEqual({ code: 'payment_provider_unavailable' });
  });

  it('still answers when Stripe fails to store the count', async () => {
    const { deps } = pass({ cs_test_paid: paidSession() });
    const flaky = {
      ...deps,
      payments: new FakePayments({ cs_test_paid: paidSession() }, 'record'),
    };
    expect(
      (await extract(request({ allowance: { type: 'pass', token: passToken() } }), flaky, {})).code,
    ).toBe('ok');
  });
});

describe('extract with recorded Bedrock responses', () => {
  const models = { primary: HAIKU_4_5, escalation: SONNET_4_6 };
  const base = (reader: ExtractDeps['reader']): ExtractDeps => ({
    reader,
    pdf: pdfInspector,
    captcha: new FakeCaptcha(),
    signer,
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models,
  });

  it('reads a confident settlement with Haiku only', async () => {
    const { reader, requests } = recordedReader({ [HAIKU_4_5]: 'settlement-confident' });
    const response = await extract(request(), base(reader), {});
    expect(response.code === 'ok' && response.extraction.fields['holiday_pay']).toEqual(f(640.5));
    expect(requests.map((r) => r.modelId)).toEqual([HAIKU_4_5]);
  });

  it('escalates a doubtful settlement to Sonnet, whose read wins', async () => {
    const { reader, requests } = recordedReader({
      [HAIKU_4_5]: 'settlement-doubtful',
      [SONNET_4_6]: 'settlement-escalated',
    });
    const metrics: ExtractMetrics = {};
    const response = await extract(request(), base(reader), metrics);
    expect(requests.map((r) => r.modelId)).toEqual([HAIKU_4_5, SONNET_4_6]);
    expect(response.code === 'ok' && response.extraction.fields['holiday_pay']).toEqual(f(640.5));
    expect(metrics).toMatchObject({ escalated: true, inputTokens: 12240, outputTokens: 930 });
  });

  it('reads a payslip and a work history', async () => {
    const payslip = recordedReader({ [HAIKU_4_5]: 'payslip' });
    const p = await extract(request({ kind: 'payslip' }), base(payslip.reader), {});
    expect(p.code === 'ok' && p.extraction.lists['accruals']).toHaveLength(3);
    const history = recordedReader({ [HAIKU_4_5]: 'work-history' });
    const h = await extract(request({ kind: 'work_history' }), base(history.reader), {});
    expect(h.code === 'ok' && h.extraction.lists['contracts']?.[2]).toEqual({
      values: { startDate: '2022-03-01' },
      confidence: 'medium',
    });
  });

  it('ignores whatever an injected document made the model add', async () => {
    const pdf: DocumentFile = {
      mediaType: 'application/pdf',
      bytes: await settlementPdf(1, INJECTION),
    };
    const injectedOnly = recordedReader({ [HAIKU_4_5]: 'injected' });
    const alone = await extract(
      request({ files: [pdf] }),
      { ...base(injectedOnly.reader), models: { primary: HAIKU_4_5, escalation: HAIKU_4_5 } },
      {},
    );
    if (alone.code !== 'ok') throw new Error(alone.code);
    expect(Object.keys(alone.extraction.fields).sort()).toEqual(
      ['detectedKind', 'endDate', 'startDate'].sort(),
    );
    expect(alone.extraction.lists['otherAccruals']).toEqual([]);
    expect(JSON.stringify(alone)).not.toMatch(/99999|SYSTEM PROMPT|admin|exfiltrate/);

    // Dropped fields are a doubt, so the document gets a second, clean read.
    const { reader } = recordedReader({
      [HAIKU_4_5]: 'injected',
      [SONNET_4_6]: 'settlement-escalated',
    });
    const escalated = await extract(request({ files: [pdf] }), base(reader), {});
    expect(escalated.code === 'ok' && escalated.extraction.fields['severance']).toBeUndefined();
  });

  it.each(['max-tokens', 'refusal', 'text-only'] as const)(
    'treats a %s answer as no answer',
    async (name) => {
      const { reader } = recordedReader({ [HAIKU_4_5]: name, [SONNET_4_6]: name });
      expect(await extract(request(), base(reader), {})).toEqual({ code: 'document_unreadable' });
    },
  );
});
