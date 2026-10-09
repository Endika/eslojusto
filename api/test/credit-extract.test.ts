import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { HAIKU_4_5, SONNET_4_6 } from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import { extract, type ExtractDeps, type ExtractMetrics } from '../src/domain/extract';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { f } from './support/fields';
import { recordedReader, type Recording } from './support/recorded';
import { INJECTION, jpeg } from './support/synthetic';

// Hand-written in Bedrock's response shape, with made-up figures and companies: no model is called.

const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};

function setup(recording: Recording) {
  const recorded = recordedReader({ [SONNET_4_6]: recording });
  const deps: ExtractDeps = {
    reader: recorded.reader,
    captcha: new FakeCaptcha(),
    signer: createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256'),
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
  };
  return { deps, requests: recorded.requests };
}

async function readCredit(recording: Recording, pages: number, files = [photo]) {
  const { deps, requests } = setup(recording);
  const metrics: ExtractMetrics = {};
  const response = await extract(
    {
      files: Array.from({ length: pages }, (_, i) => files[i % files.length] ?? photo),
      captchaToken: 'turnstile-token',
      allowance: { type: 'free', token: null },
      review: 'credit',
    },
    deps,
    metrics,
  );
  return { response, requests, metrics };
}

async function ok(recording: Recording, pages: number, files?: DocumentFile[]) {
  const { response, requests, metrics } = await readCredit(recording, pages, files);
  if (response.code !== 'ok') throw new Error(response.code);
  return { ...response, requests, metrics };
}

const value = (v: unknown, source = 'credit_agreement') =>
  expect.objectContaining({ value: v, source });

describe('a credit read', () => {
  it('asks the model with the credit prompt, schema and room to write a schedule', async () => {
    const { requests } = await ok('credit-personal-loan', 5);
    const body = requests[0]?.body;
    expect(String(body?.['system'])).toMatch(/^You read Spanish consumer credit documents/);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toContain('amortization_schedule');
    expect(body?.['max_tokens']).toBe(12_000);
  });

  it('reads a personal loan and its information sheet, and flags their different APRs', async () => {
    const { extraction, failedChecks, metrics } = await ok('credit-personal-loan', 5);
    expect(extraction.documents).toEqual([
      { kind: 'credit_agreement', pages: [1, 2, 3] },
      { kind: 'credit_precontract_info', pages: [4, 5] },
    ]);
    expect(extraction.fields).toMatchObject({
      product: value('personal_loan'),
      lenderName: value('Préstamos de Ficción E.F.C., S.A.'),
      agreedOn: value('2019-02-04'),
      principal: value(10500),
      netDisbursed: value(9738.75),
      nominalRate: value(9.95),
      declaredApr: value(12),
      instalmentCount: value(48),
      instalmentAmount: value(273.35),
      precontractDeliveredOn: value('2019-02-01', 'credit_precontract_info'),
    });
    expect(String(extraction.fields.earlyRepaymentClauseText?.value)).toContain('0,5 %');
    expect(extraction.lists.charges).toEqual([
      {
        values: {
          kind: 'opening',
          concept: 'Comisión de apertura',
          amount: 761.25,
          how: 'deducted',
        },
        confidence: 'high',
        source: 'credit_agreement',
      },
    ]);
    // The sheet's APR was read with medium confidence: it loses without a conflict.
    expect(extraction.conflicts).toEqual([]);
    expect(failedChecks).toEqual([]);
    expect(metrics).toMatchObject({ review: 'credit', pages: 5, escalated: false });
  });

  it('reads a car finance with a last larger payment, a financed premium and its schedule', async () => {
    const { extraction, failedChecks } = await ok('credit-car-balloon', 4);
    expect(extraction.fields).toMatchObject({
      product: value('car_loan'),
      intermediaryCompanyName: value('Concesionario Ficticio S.L.'),
      cashPrice: value(24500),
      instalmentCount: value(36),
      insurancePremium: value(950),
      insuranceSingle: value(true),
      insuranceFinanced: value(true),
      insuranceRequired: value(false),
    });
    expect(extraction.fields.balloonAmount?.value).toBeGreaterThan(400);
    expect(extraction.lists.schedule).toHaveLength(36);
    expect(extraction.lists.schedule?.every((r) => r.source === 'amortization_schedule')).toBe(
      true,
    );
    expect(extraction.lists.charges?.[0]?.values['how']).toBe('financed');
    expect(extraction.truncated).toBe(false);
    expect(failedChecks).toEqual([]);
  });

  it('reads a revolving card and three statements, each with its month', async () => {
    const { extraction, failedChecks } = await ok('credit-revolving-statements', 5);
    expect(extraction.documents.map((d) => [d.kind, d.month])).toEqual([
      ['revolving_agreement', undefined],
      ['card_statement', '2026-06'],
      ['card_statement', '2026-07'],
      ['card_statement', '2026-08'],
    ]);
    expect(extraction.fields).toMatchObject({
      creditLimit: value(3000, 'revolving_agreement'),
      nominalRate: value(21.94, 'revolving_agreement'),
      declaredApr: value(24.29, 'revolving_agreement'),
      minimumPaymentPercent: value(3, 'revolving_agreement'),
      paymentMode: value('percent_of_balance', 'revolving_agreement'),
    });
    expect(extraction.lists.statements?.map((s) => s.values['balance'])).toEqual([
      2900, 2866.02, 2832.44,
    ]);
    expect(failedChecks).toEqual([]);
  });

  it('reads an early repayment statement', async () => {
    const { extraction } = await ok('credit-early-repayment', 1);
    const from = 'early_repayment_statement';
    expect(extraction.fields).toMatchObject({
      repaidOn: value('2026-03-05', from),
      principalRepaid: value(12000, from),
      compensationCharged: value(180, from),
      compensationConcept: value('Comisión por cancelación anticipada', from),
      premiumRefunded: value(410.5, from),
      agreedEndOn: value('2029-01-05', from),
      paidByInsurance: value(false, from),
    });
  });

  it('reads a contract in Catalan', async () => {
    const { extraction } = await ok('credit-agreement-catalan', 2);
    expect(extraction.fields).toMatchObject({
      lenderName: value('Crèdits Imaginaris E.F.C., S.A.'),
      principal: value(6000),
      instalmentAmount: value(189.41),
    });
    expect(String(extraction.fields.withdrawalClauseText?.value)).toContain('catorze dies');
  });

  it('keeps nothing an injected page made the model add', async () => {
    const injected: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400, INJECTION) };
    const { extraction } = await ok('credit-injected', 3, [photo, injected]);
    expect(extraction.fields).toEqual({
      agreedOn: { ...f('2024-05-20'), source: 'credit_agreement' },
      principal: { ...f(8000), source: 'credit_agreement' },
      instalmentCount: { ...f(24), source: 'credit_agreement' },
      instalmentAmount: { ...f(361.3), source: 'credit_agreement' },
    });
    expect(extraction.lists).toEqual({});
    expect(JSON.stringify(extraction)).not.toMatch(/99999|Fulanito|usury|admin|exfiltrate/);
  });

  it('drops copied texts with identifiers or health in them, and doubts the read', async () => {
    const { reader, requests } = recordedReader({
      [SONNET_4_6]: 'credit-identifiers',
      [HAIKU_4_5]: 'credit-identifiers',
    });
    const { deps } = setup('credit-identifiers');
    const response = await extract(
      {
        files: [photo],
        captchaToken: 'turnstile-token',
        allowance: { type: 'free', token: null },
        review: 'credit',
      },
      { ...deps, reader, models: { primary: HAIKU_4_5, escalation: SONNET_4_6 } },
      {},
    );
    if (response.code !== 'ok') throw new Error(response.code);
    expect(Object.keys(response.extraction.fields).sort()).toEqual([
      'agreedOn',
      'insurancePremium',
      'insuranceRequired',
      'principal',
    ]);
    expect(JSON.stringify(response)).not.toMatch(/Fulano|12345678A|ES00|enfermedad|discapacidad/);
    // A discard is a doubt, so a second model reads the pack again.
    expect(requests.map((r) => r.modelId)).toEqual([HAIKU_4_5, SONNET_4_6]);
  });

  it('answers nothing_read for a page that is no credit document', async () => {
    const { response, metrics } = await readCredit('credit-not-credit', 1);
    expect(response).toEqual({
      code: 'nothing_read',
      pages: [{ page: 1, kind: 'other', readability: f('not_credit_document') }],
    });
    expect(metrics.readability).toEqual({ not_credit_document: 1 });
  });

  it('refuses a twenty-sixth page before reading anything', async () => {
    const { response, requests } = await readCredit('credit-personal-loan', 26);
    expect(response).toEqual({ code: 'too_many_files' });
    expect(requests).toEqual([]);
  });
});
