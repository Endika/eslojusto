import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { SONNET_4_6 } from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import { extract, type ExtractDeps, type ExtractMetrics } from '../src/domain/extract';
import { fingerprint } from '../src/domain/fingerprint';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { f } from './support/fields';
import { recordedReader, type Recording } from './support/recorded';
import { INJECTION, jpeg } from './support/synthetic';

// Hand-written in Bedrock's response shape, with made-up figures, companies and supply codes whose
// check letters are not valid: no model is called.

const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};

async function readElectricity(recording: Recording, pages: number, files = [photo]) {
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
      review: 'electricity',
    },
    deps,
    metrics,
  );
  return { response, requests, metrics };
}

async function ok(recording: Recording, pages: number, files = [photo]) {
  const { response, requests, metrics } = await readElectricity(recording, pages, files);
  if (response.code !== 'ok') throw new Error(response.code);
  return { ...response, requests, metrics };
}

const value = (v: unknown, source: string) => expect.objectContaining({ value: v, source });

describe('an electricity read', () => {
  it('asks the model with the electricity prompt, schema and room to write a year of bills', async () => {
    const { requests } = await ok('electricity-pvpc-reference', 2);
    const body = requests[0]?.body;
    expect(String(body?.['system'])).toMatch(/^You read Spanish household electricity documents/);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toEqual([
      'pages',
      'electricity_bill',
      'electricity_contract',
      'price_change_notice',
    ]);
    expect(body?.['max_tokens']).toBe(12_000);
  });

  it('reads a regulated-price bill line by line, with its supply code only as a fingerprint', async () => {
    const { extraction, failedChecks, metrics } = await ok('electricity-pvpc-reference', 2);
    expect(extraction.documents).toEqual([{ kind: 'electricity_bill', pages: [1, 2] }]);
    const [bill] = extraction.lists.bills ?? [];
    expect(bill?.values).toMatchObject({
      market: 'pvpc',
      readingFrom: '2026-05-31',
      readingTo: '2026-06-30',
      billedDays: 30,
      contractedPowerP1: 4.6,
      maxPowerUsedP1: 3.412,
      electricityTaxPercent: 5.11269632,
      meterPhase: 'single',
      total: 57.09,
      supplyFingerprint: fingerprint('ES0000000000000000AA'),
    });
    expect(extraction.lists.powerLines?.map((l) => l.values['price'])).toEqual([
      30.817413, 0.725423,
    ]);
    expect(extraction.lists.energyLines?.map((l) => l.values['period'])).toEqual([
      'p1',
      'p2',
      'p3',
    ]);
    expect(extraction.truncated).toBe(false);
    expect(failedChecks).toEqual([]);
    expect(metrics).toMatchObject({ review: 'electricity', pages: 2, escalated: false });
    expect(JSON.stringify(extraction)).not.toMatch(/ES ?0000/);
  });

  it('reads a free-market contract and a bill with a service and a discount', async () => {
    const { extraction, failedChecks } = await ok('electricity-free-service', 2);
    expect(extraction.fields).toMatchObject({
      priceType: value('fixed', 'electricity_contract'),
      durationMonths: value(12, 'electricity_contract'),
      renews: value(true, 'electricity_contract'),
    });
    expect(String(extraction.fields.exitPenaltyText?.value)).toContain('5 %');
    expect(extraction.lists.agreedPrices).toHaveLength(3);
    expect(
      extraction.lists.otherLines?.map((l) => [
        l.values['kind'],
        l.values['concept'],
        l.values['amount'],
      ]),
    ).toEqual([
      ['service', 'Servicio Mantenimiento Hogar Plus', 6.95],
      ['discount', 'Descuento bienvenida', 2],
    ]);
    expect(failedChecks).toEqual([]);
  });

  it('reads two bills of one supply in one pack, each line naming its bill', async () => {
    const { extraction, failedChecks } = await ok('electricity-two-bills', 4);
    expect(extraction.documents).toEqual([
      { kind: 'electricity_bill', pages: [1, 2] },
      { kind: 'electricity_bill', pages: [3, 4] },
    ]);
    const bills = extraction.lists.bills ?? [];
    expect(bills.map((b) => b.values['readingTo'])).toEqual(['2026-08-31', '2026-09-30']);
    const [first, second] = bills.map((b) => b.values['supplyFingerprint']);
    expect(first).toBe(fingerprint('ES0000111122223333BB'));
    expect(second).toBe(first);
    expect(extraction.lists.energyLines?.map((l) => l.values['document'])).toEqual([1, 2]);
    expect(failedChecks).toEqual([]);
  });

  it('reads a notice of a price change', async () => {
    const { extraction } = await ok('electricity-price-notice', 1);
    expect(extraction.fields).toMatchObject({
      noticeSentOn: value('2026-08-01', 'price_change_notice'),
      noticeAppliesFrom: value('2026-09-01', 'price_change_notice'),
      separateFromBill: value(true, 'price_change_notice'),
    });
    expect(extraction.lists.priceChanges?.[0]?.values).toEqual({
      term: 'energy',
      period: 'p1',
      before: 0.129876,
      after: 0.141234,
      unit: 'per_kwh',
    });
  });

  it('keeps nothing an injected page made the model add', async () => {
    const injected: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400, INJECTION) };
    const { extraction } = await ok('electricity-injected', 2, [photo, injected]);
    expect(extraction.fields).toEqual({});
    expect(extraction.lists.bills).toBeUndefined();
    expect(extraction.lists.energyLines?.[0]?.values).toMatchObject({ amount: 12.99 });
    expect(JSON.stringify(extraction)).not.toMatch(/overcharged|Fulanito|admin|exfiltrate/);
  });

  it('drops copied texts with a supply code, an IBAN, a phone or health in them', async () => {
    const { response } = await readElectricity('electricity-identifiers', 1);
    if (response.code !== 'ok') throw new Error(response.code);
    const [bill] = response.extraction.lists.bills ?? [];
    expect(bill?.values).toEqual({
      document: 1,
      market: 'free',
      readingFrom: '2026-06-30',
      readingTo: '2026-07-31',
      supplyFingerprint: fingerprint('ES0000111122223333BB'),
      total: 77.74,
    });
    expect(response.extraction.lists.otherLines?.map((l) => l.values['concept'])).toEqual([
      undefined,
      undefined,
      'Servicio Mantenimiento Hogar Plus',
    ]);
    expect(JSON.stringify(response)).not.toMatch(/ES0000|ES00 2100|600 123|salud/);
  });

  it('answers nothing_read for a page that is no electricity document', async () => {
    const { response, metrics } = await readElectricity('electricity-not-electricity', 1);
    expect(response).toEqual({
      code: 'nothing_read',
      pages: [{ page: 1, kind: 'other', readability: f('not_electricity_document') }],
    });
    expect(metrics.readability).toEqual({ not_electricity_document: 1 });
  });
});
