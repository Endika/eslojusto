import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { HAIKU_4_5, SONNET_4_6 } from '../src/config';
import { passClaims } from '../src/domain/allowance';
import type { DocumentFile } from '../src/domain/documents';
import {
  extract,
  NO_ESCALATION_AFTER_MS,
  READ_DEADLINE_MS,
  type ExtractDeps,
  type ExtractMetrics,
  type ExtractRequest,
} from '../src/domain/extract';
import type { SessionSnapshot } from '../src/domain/ports';
import { MAX_ESCALATION_INPUT_TOKENS } from '../src/domain/tokens';
import { coherentSettlement, f, page, proposal } from './support/fields';
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
import { INJECTION, jpeg } from './support/synthetic';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};
const PASS_EXP = Date.UTC(2026, 9, 13, 12) / 1000;
const passToken = (sid = 'cs_test_paid') => signer.sign(passClaims(sid, PASS_EXP));

function setup(
  answers: ConstructorParameters<typeof FakeReader>[0],
  options: {
    captchaOk?: boolean;
    sessions?: Record<string, SessionSnapshot>;
  } = {},
) {
  const reader = new FakeReader(answers);
  const captcha = new FakeCaptcha(options.captchaOk ?? true);
  const payments = new FakePayments(options.sessions ?? { cs_test_paid: paidSession() });
  const deps: ExtractDeps = {
    reader,
    captcha,
    signer,
    payments,
    clock: new FakeClock(),
    models: { primary: PRIMARY, escalation: ESCALATION },
  };
  return { reader, captcha, payments, deps };
}

const request = (overrides: Partial<ExtractRequest> = {}): ExtractRequest => ({
  files: [photo],
  captchaToken: 'turnstile-token',
  allowance: { type: 'free', token: null },
  ...overrides,
});

const withProposal = (fields: Record<string, unknown>) => ({
  ...coherentSettlement(),
  settlement_proposal: { ...proposal(), ...fields },
});

describe('extract', () => {
  it('returns a confident, coherent primary read without escalating', async () => {
    const { reader, deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    const metrics: ExtractMetrics = {};
    const response = await extract(request(), deps, metrics);
    expect(response.code).toBe('ok');
    if (response.code !== 'ok') return;
    expect(response.extraction.fields.holiday_pay).toEqual({
      ...f(640.5),
      source: 'settlement_proposal',
    });
    expect(response.extraction.documents).toEqual([{ kind: 'settlement_proposal', pages: [1] }]);
    expect(response.failedChecks).toEqual([]);
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY]);
    expect(metrics).toEqual({
      pages: 1,
      inputTokens: 1000,
      outputTokens: 200,
      escalated: false,
      conflicts: 0,
    });
  });

  it.each([
    ['a low-confidence field', coherentSettlement('low')],
    ['items that do not add up', withProposal({ totalGross: f(9000) })],
    ['an impossible date', withProposal({ endDate: f('2026-02-30') })],
    ['an end date before the start', withProposal({ endDate: f('2020-01-01') })],
    ['no tool output', null],
    ['a page left unclassified', { settlement_proposal: proposal() }],
    ['a page of low confidence', { ...coherentSettlement(), pages: [page(1, 'other', 1, 'low')] }],
    [
      'documents that put the end before the start between them',
      {
        pages: [page(1, 'company_certificate')],
        settlement_proposal: { startDate: f('2022-03-01') },
        company_certificate: { endDate: f('2020-01-01') },
      },
    ],
  ])('escalates on %s and the escalation read wins', async (_, primaryInput) => {
    const { reader, deps } = setup({
      [PRIMARY]: read(primaryInput),
      [ESCALATION]: read(withProposal({ severance: f(321) }), 2000, 300),
    });
    const metrics: ExtractMetrics = {};
    const response = await extract(request(), deps, metrics);
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY, ESCALATION]);
    expect(response.code).toBe('ok');
    if (response.code === 'ok')
      expect(response.extraction.fields.severance).toEqual({
        ...f(321),
        source: 'settlement_proposal',
      });
    expect(metrics.escalated).toBe(true);
    expect(metrics.inputTokens).toBe(3000);
  });

  it('keeps a usable primary read when the escalation read has nothing to say', async () => {
    const { deps } = setup({
      [PRIMARY]: read(coherentSettlement('low')),
      [ESCALATION]: read(null),
    });
    const response = await extract(request(), deps, {});
    expect(response.code === 'ok' && response.extraction.fields.startDate).toEqual({
      ...f('2022-03-01', 'low'),
      source: 'settlement_proposal',
    });
  });

  it('keeps the escalated read even when it is still doubtful', async () => {
    const { deps } = setup({
      [PRIMARY]: read(coherentSettlement('low')),
      [ESCALATION]: read(withProposal({ totalGross: f(1) })),
    });
    const response = await extract(request(), deps, {});
    expect(response.code === 'ok' && response.failedChecks).toEqual(['items_do_not_sum']);
  });

  it('gives every read the deadline, and starts no second read after 90 s', async () => {
    const clock = new FakeClock();
    const started = clock.ms;
    const slow = new FakeReader(
      { [PRIMARY]: read(coherentSettlement('low')), [ESCALATION]: read(coherentSettlement()) },
      () => {
        clock.ms += NO_ESCALATION_AFTER_MS;
      },
    );
    const { deps } = setup({});
    const metrics: ExtractMetrics = {};
    const response = await extract(request(), { ...deps, reader: slow, clock }, metrics);
    expect(response.code).toBe('ok');
    expect(slow.calls.map((c) => c.model)).toEqual([PRIMARY]);
    expect(slow.calls[0]?.deadline).toBe(started + READ_DEADLINE_MS);
    expect(metrics.escalated).toBe(false);
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

  it('flags a read that cost more than twice its estimate', async () => {
    // One 1176 × 1568 photo: 13,000 + 1176 × 1568 / 750 = 15,459 estimated tokens.
    const fooled = setup({ [PRIMARY]: read(coherentSettlement(), 30_919) });
    const metrics: ExtractMetrics = {};
    await extract(request(), fooled.deps, metrics);
    expect(metrics.underestimated).toBe(true);
    const honest = setup({ [PRIMARY]: read(coherentSettlement(), 30_918) });
    const fine: ExtractMetrics = {};
    await extract(request(), honest.deps, fine);
    expect(fine.underestimated).toBeUndefined();
  });

  it('falls back to the primary read if the escalation call fails', async () => {
    const { deps } = setup({
      [PRIMARY]: read(coherentSettlement('low')),
      [ESCALATION]: new Error('throttled'),
    });
    const response = await extract(request(), deps, {});
    expect(response.code === 'ok' && response.extraction.fields.startDate).toEqual({
      ...f('2022-03-01', 'low'),
      source: 'settlement_proposal',
    });
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

  it('answers a pack with nothing useful in it without escalating', async () => {
    const { reader, deps } = setup({ [PRIMARY]: read({ pages: [page(1, 'other')] }) });
    const response = await extract(request(), deps, {});
    expect(response).toMatchObject({
      code: 'ok',
      extraction: { documents: [{ kind: 'other', pages: [1] }], fields: {}, conflicts: [] },
    });
    expect(reader.calls).toHaveLength(1);
  });

  it.each([
    [
      'a dismissal letter that yielded no figure',
      { pages: [page(1, 'dismissal_letter')], dismissal_letter: { endDate: f('2026-06-30') } },
    ],
    [
      'a final payslip without salary lines or items',
      { pages: [page(1, 'payslip')], final_payslip: { periodStart: f('2026-09-01') } },
    ],
    [
      'payslip lines without saying whether extra pay is prorated',
      {
        pages: [page(1, 'payslip')],
        monthly_payslip: {
          lines: [
            { concept: 'SALARIO BASE', amount: 1500, category: 'salary', confidence: 'high' },
          ],
        },
      },
    ],
    [
      'a page set aside in a pack with a letter but no settlement or final payslip',
      {
        pages: [page(1, 'dismissal_letter'), page(2, 'other')],
        dismissal_letter: { severance: f(900) },
      },
    ],
  ])('takes a second look at %s', async (_, input) => {
    const pages = input.pages.length;
    const { reader, deps } = setup({ [PRIMARY]: read(input), [ESCALATION]: read(input) });
    const files = Array.from({ length: pages }, () => photo);
    expect((await extract(request({ files }), deps, {})).code).toBe('ok');
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY, ESCALATION]);
  });

  it('takes a second look when a value lost to a preferred source without being sure', async () => {
    const input = {
      pages: [page(1, 'settlement_proposal'), page(2, 'payslip')],
      settlement_proposal: { ...proposal(), pending_salary: f(150, 'medium') },
      final_payslip: {
        lines: [{ concept: 'SALARIO BASE', amount: 1250, category: 'salary', confidence: 'high' }],
      },
    };
    const { reader, deps } = setup({ [PRIMARY]: read(input), [ESCALATION]: read(input) });
    const response = await extract(request({ files: [photo, photo] }), deps, {});
    expect(reader.calls.map((c) => c.model)).toEqual([PRIMARY, ESCALATION]);
    expect(response).toMatchObject({ code: 'ok', extraction: { conflicts: [] } });
    expect(response).not.toHaveProperty(['extraction', 'discarded']);
  });

  it('does not look again at a tax certificate set aside beside a letter and its settlement', async () => {
    const input = {
      ...coherentSettlement(),
      pages: [page(1, 'dismissal_letter'), page(2, 'settlement_proposal'), page(3, 'other')],
      dismissal_letter: { severance: f(900) },
    };
    const { reader, deps } = setup({ [PRIMARY]: read(input) });
    const files = [photo, photo, photo];
    expect((await extract(request({ files }), deps, {})).code).toBe('ok');
    expect(reader.calls).toHaveLength(1);
  });

  it('does not look again at payslip lines that say the extra pay is prorated', async () => {
    const input = {
      pages: [page(1, 'payslip')],
      monthly_payslip: {
        extraPayProrated: f(true),
        lines: [
          { concept: 'SALARIO BASE', amount: 1500, category: 'salary', confidence: 'high' },
          { concept: 'PP PAGAS EXTRAS', amount: 250, category: 'salary', confidence: 'high' },
        ],
      },
    };
    const { reader, deps } = setup({ [PRIMARY]: read(input) });
    expect((await extract(request(), deps, {})).code).toBe('ok');
    expect(reader.calls).toHaveLength(1);
  });

  it('reads each image as one page', async () => {
    const { reader, deps } = setup({
      [PRIMARY]: read({ pages: [1, 2, 3].map((n) => page(n, 'other')) }),
    });
    const metrics: ExtractMetrics = {};
    expect((await extract(request({ files: [photo, photo, photo] }), deps, metrics)).code).toBe(
      'ok',
    );
    expect(reader.calls[0]?.files).toHaveLength(3);
    expect(metrics.pages).toBe(3);
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

  it('verifies the captcha before parsing any image', async () => {
    // An oversized image is only noticed once the captcha has passed.
    const huge: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(4000, 3000) };
    const rejecting = setup({}, { captchaOk: false });
    expect((await extract(request({ files: [huge] }), rejecting.deps, {})).code).toBe(
      'captcha_failed',
    );
    const accepting = setup({});
    expect((await extract(request({ files: [huge] }), accepting.deps, {})).code).toBe(
      'image_too_large',
    );
  });

  it('reads fifteen of the largest images and refuses a sixteenth', async () => {
    const { reader, deps } = setup({ [PRIMARY]: read(coherentSettlement()) });
    const largest: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1568, 1568) };
    const metrics: ExtractMetrics = {};
    const fifteen = Array.from({ length: 15 }, () => largest);
    expect((await extract(request({ files: fifteen }), deps, metrics)).code).toBe('ok');
    expect(metrics.pages).toBe(15);
    expect(await extract(request({ files: [...fifteen, largest] }), deps, {})).toEqual({
      code: 'too_many_files',
    });
    expect(reader.calls.filter((c) => c.model === PRIMARY)).toHaveLength(1);
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

  it('does not count a read that found the models unavailable', async () => {
    const { deps } = setup({ [PRIMARY]: new Error('down'), [ESCALATION]: new Error('down') });
    const token = signer.sign({ typ: 'quota', day: '2026-10-07', used: 1 });
    const allowance = { type: 'free' as const, token };
    expect(await extract(request({ allowance }), deps, {})).toEqual({ code: 'model_unavailable' });
    // The same token still has its second read of the day.
    const back = setup({ [PRIMARY]: read(coherentSettlement()) });
    const next = await extract(request({ allowance }), back.deps, {});
    if (next.code !== 'ok' || !next.allowanceToken) throw new Error(next.code);
    expect(signer.verify(next.allowanceToken)).toMatchObject({ used: 2 });
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

  it('does not spend a pass read when the models are unavailable', async () => {
    const { payments, deps } = setup(
      { [PRIMARY]: new Error('denied'), [ESCALATION]: new Error('denied') },
      { sessions: { cs_test_paid: paidSession({ readsUsed: 3 }) } },
    );
    expect(
      await extract(request({ allowance: { type: 'pass', token: passToken() } }), deps, {}),
    ).toEqual({ code: 'model_unavailable' });
    expect(payments.recorded).toEqual([]);
  });

  it('still answers when Stripe fails to store the count, and flags it', async () => {
    const { deps } = pass({ cs_test_paid: paidSession() });
    const flaky = {
      ...deps,
      payments: new FakePayments({ cs_test_paid: paidSession() }, 'record'),
    };
    const metrics: ExtractMetrics = {};
    const allowance = { type: 'pass' as const, token: passToken() };
    expect((await extract(request({ allowance }), flaky, metrics)).code).toBe('ok');
    expect(metrics.countNotSaved).toBe(true);
    const saved: ExtractMetrics = {};
    await extract(request({ allowance }), deps, saved);
    expect(saved.countNotSaved).toBeUndefined();
  });
});

describe('extract with recorded Bedrock responses', () => {
  const models = { primary: HAIKU_4_5, escalation: SONNET_4_6 };
  const base = (reader: ExtractDeps['reader']): ExtractDeps => ({
    reader,
    captcha: new FakeCaptcha(),
    signer,
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models,
  });

  it('reads a confident settlement with Haiku only', async () => {
    const { reader, requests } = recordedReader({ [HAIKU_4_5]: 'settlement-confident' });
    const response = await extract(request(), base(reader), {});
    expect(response.code === 'ok' && response.extraction.fields.holiday_pay?.value).toBe(640.5);
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
    expect(response.code === 'ok' && response.extraction.fields.holiday_pay?.value).toBe(640.5);
    expect(metrics).toMatchObject({ escalated: true, inputTokens: 12240, outputTokens: 930 });
  });

  it('reads a payslip and a work history', async () => {
    const payslip = recordedReader({ [HAIKU_4_5]: 'payslip' });
    const p = await extract(request(), base(payslip.reader), {});
    expect(p.code === 'ok' && p.extraction.fields).toMatchObject({
      payslipTotalAccrued: { value: 1980, source: 'payslip' },
      extraPayProrated: { value: true, source: 'payslip' },
    });
    expect(p.code === 'ok' && p.extraction.documents).toEqual([
      { kind: 'payslip', pages: [1], month: '2026-08' },
    ]);
    const history = recordedReader({ [HAIKU_4_5]: 'work-history' });
    const h = await extract(request(), base(history.reader), {});
    expect(h.code === 'ok' && h.extraction.lists.contracts?.[2]).toEqual({
      values: { startDate: '2022-03-01' },
      confidence: 'medium',
      source: 'work_history',
    });
  });

  it('reads a mixed pack into one result and flags where its documents disagree', async () => {
    // Its page 4 is set aside as other, but the pack has its settlement: no second look.
    const { reader, requests } = recordedReader({ [HAIKU_4_5]: 'pack', [SONNET_4_6]: 'pack' });
    const metrics: ExtractMetrics = {};
    const response = await extract(
      request({ files: Array.from({ length: 5 }, () => photo) }),
      base(reader),
      metrics,
    );
    if (response.code !== 'ok') throw new Error(response.code);
    expect(response.extraction.documents).toEqual([
      { kind: 'dismissal_letter', pages: [1, 2] },
      { kind: 'payslip', pages: [3], month: '2026-08' },
      { kind: 'other', pages: [4] },
      { kind: 'settlement_proposal', pages: [5] },
    ]);
    expect(response.extraction.fields).toMatchObject({
      endDate: { value: '2026-09-15', source: 'settlement_proposal' },
      cause: { value: 'objective_dismissal', source: 'dismissal_letter' },
      noticeDaysReceived: { value: 15, source: 'dismissal_letter' },
      severance: { value: 5000, source: 'settlement_proposal' },
      payslipTotalAccrued: { value: 1980, source: 'payslip' },
    });
    expect(response.extraction.conflicts).toEqual([
      { field: 'endDate', sources: ['settlement_proposal', 'dismissal_letter'] },
    ]);
    expect(metrics).toMatchObject({ pages: 5, escalated: false, conflicts: 1 });
    expect(requests.map((r) => r.modelId)).toEqual([HAIKU_4_5]);
  });

  it('ignores whatever an injected document made the model add', async () => {
    const injected: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400, INJECTION) };
    const injectedOnly = recordedReader({ [HAIKU_4_5]: 'injected' });
    const alone = await extract(
      request({ files: [injected] }),
      { ...base(injectedOnly.reader), models: { primary: HAIKU_4_5, escalation: HAIKU_4_5 } },
      {},
    );
    if (alone.code !== 'ok') throw new Error(alone.code);
    expect(Object.keys(alone.extraction.fields).sort()).toEqual(['endDate', 'startDate']);
    // The page given twice, the second time with a key of its own, is read once.
    expect(alone.extraction.pages).toEqual([page(1, 'settlement_proposal')]);
    expect(JSON.stringify(alone)).not.toMatch(/99999|SYSTEM PROMPT|admin|exfiltrate/);

    // Dropped fields are a doubt, so the document gets a second, clean read.
    const { reader } = recordedReader({
      [HAIKU_4_5]: 'injected',
      [SONNET_4_6]: 'settlement-escalated',
    });
    const escalated = await extract(request({ files: [injected] }), base(reader), {});
    expect(escalated.code === 'ok' && escalated.extraction.fields.severance).toBeUndefined();
  });

  it.each(['max-tokens', 'refusal', 'text-only'] as const)(
    'treats a %s answer as no answer',
    async (name) => {
      const { reader } = recordedReader({ [HAIKU_4_5]: name, [SONNET_4_6]: name });
      expect(await extract(request(), base(reader), {})).toEqual({ code: 'document_unreadable' });
    },
  );
});
