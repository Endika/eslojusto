import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { SONNET_4_6 } from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import { extract, type ExtractDeps, type ExtractMetrics } from '../src/domain/extract';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { f } from './support/fields';
import { recordedReader, type Recording } from './support/recorded';
import { INJECTION, jpeg } from './support/synthetic';

// Hand-written in Bedrock's response shape, with made-up deeds, lenders and figures: no model is
// called.

const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};

async function readMortgage(recording: Recording, pages: number, files = [photo]) {
  const { reader, requests } = recordedReader({ [SONNET_4_6]: recording });
  const deps: ExtractDeps = {
    reader,
    captcha: new FakeCaptcha(),
    signer: createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256'),
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
  };
  const metrics: ExtractMetrics = {};
  const response = await extract(
    {
      files: Array.from({ length: pages }, (_, i) => files[i % files.length] ?? photo),
      captchaToken: 'turnstile-token',
      allowance: { type: 'free', token: null },
      review: 'mortgage',
    },
    deps,
    metrics,
  );
  return { response, requests, metrics };
}

async function ok(recording: Recording, pages: number, files?: DocumentFile[]) {
  const { response, requests, metrics } = await readMortgage(recording, pages, files);
  if (response.code !== 'ok') throw new Error(response.code);
  return { ...response, requests, metrics };
}

const value = (v: unknown, source = 'mortgage_deed') =>
  expect.objectContaining({ value: v, source });

describe('a mortgage read', () => {
  it('asks the model with the mortgage prompt, schema and room to copy long clauses', async () => {
    const { requests } = await ok('mortgage-deed-2012', 6);
    const body = requests[0]?.body;
    expect(String(body?.['system'])).toMatch(/^You read a Spanish mortgage loan deed/);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toContain('mortgage_deed');
    expect(body?.['max_tokens']).toBe(12_000);
  });

  it('reads a 2012 deed with its expenses clause, and the purchase’s notary bill apart', async () => {
    const { extraction, failedChecks, metrics } = await ok('mortgage-deed-2012', 6);
    expect(extraction.documents).toEqual([
      { kind: 'mortgage_deed', pages: [1, 2, 3] },
      { kind: 'notary_invoice', pages: [4] },
      { kind: 'registry_invoice', pages: [5] },
      { kind: 'valuation_invoice', pages: [6] },
    ]);
    expect(extraction.fields).toMatchObject({
      deedOn: value('2012-04-17'),
      lenderName: value('Banco Imaginario, S.A.'),
      borrowerType: value('individual'),
      purpose: value('housing'),
      principal: value(150000),
      rateType: value('variable'),
      index: value('euribor'),
      spread: value(0.875),
      floorPercent: value(3),
      defaultRate: value(19),
      openingFee: value(1500),
    });
    expect(extraction.lists.clauses?.map((c) => c.values['label'])).toEqual([
      'euribor',
      'floor_clause',
      'default_interest',
      'expenses_clause',
    ]);
    expect(String(extraction.lists.clauses?.[3]?.values['text'])).toContain(
      'aranceles notariales y registrales',
    );
    expect(
      extraction.lists.notaryInvoices?.map((r) => [r.values['concept'], r.values['total']]),
    ).toEqual([
      ['loan', 626.57],
      ['purchase', 720.04],
    ]);
    expect(extraction.lists.registryInvoices?.[0]?.values).toMatchObject({
      concept: 'mortgage',
      total: 365.8,
    });
    expect(extraction.truncated).toBe(false);
    expect(failedChecks).toEqual([]);
    expect(metrics).toMatchObject({ review: 'mortgage', pages: 6, escalated: false });
  });

  it('flags a mixed notary bill, an agency outlay paid twice and the purchase’s tax', async () => {
    const { extraction, failedChecks } = await ok('mortgage-mixed-agency', 4);
    expect(extraction.lists.agencySupplied?.map((r) => r.values)).toEqual([
      { concept: 'ajd', amount: 1800 },
      { concept: 'other', amount: 200 },
    ]);
    expect(extraction.lists.ajdForms?.map((r) => r.values['concept'])).toEqual([
      'loan',
      'purchase',
    ]);
    expect(failedChecks).toEqual([
      'invoice_mixes_purchase_and_loan',
      'duplicate_supplied_amount',
      'ajd_purchase_not_loan',
    ]);
  });

  it('reads a 2020 deed with a 1 % floor, the information before it and a later repayment', async () => {
    const { extraction, failedChecks } = await ok('mortgage-deed-2020-floor', 6);
    expect(extraction.fields).toMatchObject({
      deedOn: value('2020-07-09'),
      floorPercent: value(1),
      spread: value(0.99),
      defaultMarginPoints: value(3),
      earlyTerminationInstalments: value(12),
      prepaymentOption: value('a_015_5y'),
      transparencyActStated: value(true),
      feinDeliveredOn: value('2020-06-22', 'fein'),
      fiaeDeliveredOn: value('2020-06-22', 'fiae'),
      transparencyActOn: value('2020-07-08', 'transparency_deed'),
      transparencyActCharged: value(0, 'transparency_deed'),
    });
    expect(extraction.lists.operations?.map((r) => r.values)).toEqual([
      {
        on: '2023-03-15',
        kind: 'partial_prepayment',
        principal: 20000,
        feeCharged: 30,
        feeConcept: 'Compensación por desistimiento',
      },
    ]);
    expect(extraction.conflicts).toEqual([]);
    expect(failedChecks).toEqual([]);
  });

  it('says which page is missing when the deed comes without its expenses clause', async () => {
    const { extraction, failedChecks } = await ok('mortgage-deed-without-expenses', 2);
    expect(extraction.fields).toMatchObject({ earlyTerminationInstalments: value(1) });
    expect(failedChecks).toEqual(['missing_key_page']);
  });

  it('drops copied texts that name a guarantor or carry a DNI or health, and keeps the rest', async () => {
    const { extraction } = await ok('mortgage-identifiers', 2);
    expect(extraction.lists.clauses?.map((c) => c.values['label'])).toEqual([
      'expenses_clause',
      'early_termination',
      'insurance_required',
    ]);
    expect(extraction.lists.clauses?.filter((c) => 'text' in c.values)).toHaveLength(1);
    expect(extraction.lists.operations?.[0]?.values).toEqual({
      on: '2021-06-01',
      kind: 'full_prepayment',
      principal: 60000,
      feeCharged: 300,
    });
    expect(JSON.stringify(extraction)).not.toMatch(/Mengano|Fulano|12345678A|salud|enfermedad/);
  });

  it('keeps nothing an injected page made the model add', async () => {
    const injected: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400, INJECTION) };
    const { extraction, failedChecks } = await ok('mortgage-injected', 2, [photo, injected]);
    expect(extraction.fields).toEqual({
      deedOn: { ...f('2018-12-14'), source: 'mortgage_deed' },
      principal: { ...f(110000), source: 'mortgage_deed' },
    });
    expect(extraction.lists).toEqual({});
    expect(JSON.stringify(extraction)).not.toMatch(/Fulanito|abusive|250|admin|exfiltrate/);
    expect(failedChecks).toEqual(['missing_key_page']);
  });

  it('answers nothing_read for a page that is no mortgage document', async () => {
    const { response, metrics } = await readMortgage('mortgage-not-mortgage', 1);
    expect(response).toEqual({
      code: 'nothing_read',
      pages: [{ page: 1, kind: 'other', readability: f('not_mortgage_document') }],
    });
    expect(metrics.readability).toEqual({ not_mortgage_document: 1 });
  });

  it('refuses a twenty-sixth page before reading anything', async () => {
    const { response, requests } = await readMortgage('mortgage-deed-2012', 26);
    expect(response).toEqual({ code: 'too_many_files' });
    expect(requests).toEqual([]);
  });
});
