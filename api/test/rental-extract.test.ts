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

async function readRental(recording: Recording, pages: number, files = [photo]) {
  const { deps, requests } = setup(recording);
  const metrics: ExtractMetrics = {};
  const response = await extract(
    {
      files: Array.from({ length: pages }, (_, i) => files[i % files.length] ?? photo),
      captchaToken: 'turnstile-token',
      allowance: { type: 'free', token: null },
      review: 'rental',
    },
    deps,
    metrics,
  );
  return { response, requests, metrics };
}

async function ok(recording: Recording, pages: number, files?: DocumentFile[]) {
  const { response, requests, metrics } = await readRental(recording, pages, files);
  if (response.code !== 'ok') throw new Error(response.code);
  return { ...response, requests, metrics };
}

const value = (v: unknown, source = 'lease') => expect.objectContaining({ value: v, source });

describe('a rental read', () => {
  it('asks the model with the rental prompt and schema', async () => {
    const { requests } = await ok('rental-lease', 4);
    const body = requests[0]?.body;
    expect(String(body?.['system'])).toMatch(/^You read Spanish residential tenancy documents/);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toContain('lease');
  });

  it('reads a whole lease contract', async () => {
    const { extraction, failedChecks, metrics } = await ok('rental-lease', 4);
    expect(extraction.documents).toEqual([{ kind: 'lease', pages: [1, 2, 3, 4] }]);
    expect(extraction.fields).toMatchObject({
      signedOn: value('2024-05-20'),
      startDate: value('2024-06-01'),
      postcode: value('28999'),
      landlordType: value('company'),
      landlordCompanyName: value('Pisos de Mentira S.L.'),
      use: value('main_home'),
      agreedMonths: value(60),
      initialRent: value(1100),
      updateClauseIndex: value('irav'),
      deposit: value(1100),
      necessityClause: value(false),
    });
    expect(String(extraction.fields.updateClauseText?.value)).toContain('(IRAV)');
    expect(extraction.lists.guarantees).toEqual([
      { values: { kind: 'cash', amount: 2200, months: 2 }, confidence: 'high', source: 'lease' },
    ]);
    expect(extraction.lists.charges?.map((c) => c.values['kind'])).toEqual(['community', 'waste']);
    expect(extraction.lists.utilities).toHaveLength(2);
    expect(failedChecks).toEqual([]);
    expect(metrics).toMatchObject({ review: 'rental', pages: 4, escalated: false });
  });

  it('reads a contract, two update notices and twelve receipts as one pack', async () => {
    const { extraction, failedChecks } = await ok('rental-lease-notices-receipts', 15);
    expect(extraction.documents.map((d) => d.kind)).toEqual([
      'lease',
      'rent_update_notice',
      'rent_update_notice',
      ...Array<string>(12).fill('rent_receipt'),
    ]);
    expect(extraction.documents[3]).toEqual({ kind: 'rent_receipt', pages: [4], month: '2025-05' });
    expect(extraction.fields.landlordType).toEqual({ ...f('person'), source: 'lease' });
    expect(extraction.fields.landlordCompanyName).toBeUndefined();
    expect(extraction.lists.notices?.map((n) => n.values['newRent'])).toEqual([919.8, 938.2]);
    expect(extraction.lists.notices?.[1]?.source).toBe('rent_update_notice');
    expect(extraction.lists.receipts).toHaveLength(12);
    expect(extraction.lists.receipts?.every((r) => r.source === 'rent_receipt')).toBe(true);
    expect(failedChecks).toEqual([]);
  });

  it('reads an agency invoice for a solvency check as such', async () => {
    const { extraction } = await ok('rental-agency-invoice', 1);
    expect(extraction.lists.invoices?.[0]).toEqual({
      values: {
        issuedOn: '2026-10-20',
        issuer: 'agency',
        concept: 'Estudio de solvencia',
        conceptKind: 'solvency_check',
        base: 250,
        vat: 52.5,
        total: 302.5,
      },
      confidence: 'high',
      source: 'agency_invoice',
    });
    expect(extraction.lists.invoices?.[1]?.values['conceptKind']).toBe('reservation');
  });

  it('reads a deposit return with what was kept back', async () => {
    const { extraction, failedChecks } = await ok('rental-deposit-return', 1);
    expect(extraction.fields).toMatchObject({
      keysReturnedOn: value('2026-07-31', 'deposit_return'),
      deposit: value(1000, 'deposit_return'),
      closingDocumentSigned: value(true, 'deposit_return'),
    });
    expect(extraction.lists.returns?.map((r) => r.values)).toEqual([
      { on: '2026-08-20', amount: 650 },
    ]);
    expect(extraction.lists.deductions?.map((d) => [d.values['kind'], d.values['amount']])).toEqual(
      [
        ['cleaning', 150],
        ['damage', 200],
      ],
    );
    expect(failedChecks).toEqual([]);
  });

  it('reads a contract in Catalan', async () => {
    const { extraction } = await ok('rental-lease-catalan', 2);
    expect(extraction.fields).toMatchObject({
      signedOn: value('2025-01-15'),
      updateClauseIndex: value('fixed_percent'),
      updateFixedPercent: value(3),
      initialRent: value(850),
      landlordCompanyName: value('Habitatges Imaginaris S.A.'),
    });
    expect(String(extraction.fields.updateClauseText?.value)).toContain("s'actualitzarà");
  });

  it('keeps nothing an injected page made the model add', async () => {
    const injected: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400, INJECTION) };
    const { extraction } = await ok('rental-injected', 2, [photo, injected]);
    expect(extraction.fields).toEqual({
      signedOn: { ...f('2024-05-20'), source: 'lease' },
      startDate: { ...f('2024-06-01'), source: 'lease' },
      initialRent: { ...f(1100), source: 'lease' },
      landlordType: { ...f('person'), source: 'lease' },
    });
    expect(extraction.lists).toEqual({});
    expect(extraction.pages.map((p) => p.page)).toEqual([1]);
    expect(JSON.stringify(extraction)).not.toMatch(/99999|Fulanito|abusive|admin|exfiltrate/);
  });

  it('drops a copied text that slipped through with identifiers, and doubts the read', async () => {
    const { reader, requests } = recordedReader({
      [SONNET_4_6]: 'rental-identifiers',
      [HAIKU_4_5]: 'rental-identifiers',
    });
    const { deps } = setup('rental-identifiers');
    const response = await extract(
      {
        files: [photo],
        captchaToken: 'turnstile-token',
        allowance: { type: 'free', token: null },
        review: 'rental',
      },
      { ...deps, reader, models: { primary: HAIKU_4_5, escalation: SONNET_4_6 } },
      {},
    );
    if (response.code !== 'ok') throw new Error(response.code);
    expect(Object.keys(response.extraction.fields).sort()).toEqual([
      'initialRent',
      'landlordType',
      'signedOn',
    ]);
    expect(JSON.stringify(response)).not.toMatch(/Fulano|12345678A|ES00|600123456|@/);
    // A discard is a doubt, so a second model reads the pack again.
    expect(requests.map((r) => r.modelId)).toEqual([HAIKU_4_5, SONNET_4_6]);
  });

  it('answers nothing_read for a page that is no rental document', async () => {
    const { response, metrics } = await readRental('rental-not-rental', 1);
    expect(response).toEqual({
      code: 'nothing_read',
      pages: [{ page: 1, kind: 'other', readability: f('not_rental_document') }],
    });
    expect(metrics.readability).toEqual({ not_rental_document: 1 });
  });

  it('refuses a twenty-sixth page before reading anything', async () => {
    const { response, requests } = await readRental('rental-lease', 26);
    expect(response).toEqual({ code: 'too_many_files' });
    expect(requests).toEqual([]);
  });
});
