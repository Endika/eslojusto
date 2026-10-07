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
import { coherentSettlement, f } from './support/fields';
import { ESCALATION, FakeCaptcha, FakeClock, FakeReader, PRIMARY, read } from './support/fakes';
import { recordedReader } from './support/recorded';
import { INJECTION, jpeg, settlementPdf } from './support/synthetic';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};

function setup(answers: ConstructorParameters<typeof FakeReader>[0], captchaOk = true) {
  const reader = new FakeReader(answers);
  const captcha = new FakeCaptcha(captchaOk);
  const deps: ExtractDeps = {
    reader,
    pdf: pdfInspector,
    captcha,
    signer,
    clock: new FakeClock(),
    models: { primary: PRIMARY, escalation: ESCALATION },
  };
  return { reader, captcha, deps };
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

  it('takes the same path with a pass', async () => {
    const pass = signer.sign(passClaims('cs_test_a', Date.UTC(2026, 9, 10) / 1000, 0));
    const { reader, deps } = setup({
      [PRIMARY]: read(coherentSettlement('low')),
      [ESCALATION]: read(coherentSettlement()),
    });
    const response = await extract(request({ allowance: { type: 'pass', token: pass } }), deps, {});
    expect(response.code).toBe('ok');
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY, ESCALATION]);
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

  it.each([
    ['the provider fails', new Error('down'), 'model_unavailable'],
    ['the provider rejects the document', { outcome: 'rejected' as const }, 'document_unreadable'],
  ])('reports when %s', async (_, answer, code) => {
    const { deps } = setup({ [PRIMARY]: answer });
    expect(await extract(request(), deps, {})).toEqual({ code });
  });

  it('reports an unreadable document when neither model records anything', async () => {
    const { deps } = setup({ [PRIMARY]: read(null), [ESCALATION]: read(null) });
    expect(await extract(request(), deps, {})).toEqual({ code: 'document_unreadable' });
  });

  it('checks files, allowance and captcha before calling any model', async () => {
    const { reader, captcha, deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    expect((await extract(request({ files: [] }), deps, {})).code).toBe('no_files');
    expect(
      (await extract(request({ allowance: { type: 'pass', token: 'forged' } }), deps, {})).code,
    ).toBe('pass_invalid');
    expect(captcha.tokens).toEqual([]);
    const rejecting = setup({ [PRIMARY]: read(coherentSettlement()) }, false);
    expect((await extract(request(), rejecting.deps, {})).code).toBe('captcha_failed');
    expect(reader.calls).toEqual([]);
    expect(rejecting.reader.calls).toEqual([]);
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

  it('refuses a PDF it cannot open', async () => {
    const { deps } = setup({});
    const broken: DocumentFile = {
      mediaType: 'application/pdf',
      bytes: new TextEncoder().encode('%PDF-1.7\nthis is not a pdf'),
    };
    expect(await extract(request({ files: [broken] }), deps, {})).toEqual({
      code: 'pdf_unreadable',
    });
  });

  it('hands back a quota token counting the read', async () => {
    const { deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    const first = await extract(request(), deps, {});
    if (first.code !== 'ok') throw new Error(first.code);
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
    if (second.code !== 'ok') throw new Error(second.code);
    const third = await extract(
      request({ allowance: { type: 'free', token: second.allowanceToken } }),
      deps,
      {},
    );
    expect(third).toEqual({ code: 'daily_limit_reached' });
  });

  it('does not count a read that failed', async () => {
    const { deps } = setup({ [PRIMARY]: new Error('down') });
    const token = signer.sign({ typ: 'quota', day: '2026-10-07', used: 1 });
    expect((await extract(request({ allowance: { type: 'free', token } }), deps, {})).code).toBe(
      'model_unavailable',
    );
  });
});

describe('extract with recorded Bedrock responses', () => {
  const models = { primary: HAIKU_4_5, escalation: SONNET_4_6 };
  const base = (reader: ExtractDeps['reader']): ExtractDeps => ({
    reader,
    pdf: pdfInspector,
    captcha: new FakeCaptcha(),
    signer,
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
    const { reader } = recordedReader({
      [HAIKU_4_5]: 'injected',
      [SONNET_4_6]: 'settlement-escalated',
    });
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
