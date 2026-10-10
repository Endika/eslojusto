import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { SONNET_4_6 } from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import { extract, type ExtractDeps, type ExtractMetrics } from '../src/domain/extract';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { f } from './support/fields';
import { recordedReader, type Recording } from './support/recorded';
import { jpeg } from './support/synthetic';

// Hand-written in Bedrock's response shape, with made-up figures and companies: no model is called.

const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};

async function readTelecom(recording: Recording, pages: number) {
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
      files: Array.from({ length: pages }, () => photo),
      captchaToken: 'turnstile-token',
      allowance: { type: 'free', token: null },
      review: 'telecom',
    },
    deps,
    metrics,
  );
  return { response, requests, metrics };
}

async function ok(recording: Recording, pages: number) {
  const { response, requests, metrics } = await readTelecom(recording, pages);
  if (response.code !== 'ok') throw new Error(response.code);
  return { ...response, requests, metrics };
}

const value = (v: unknown) => expect.objectContaining({ value: v, source: 'telecom_contract' });

describe('a telecom read', () => {
  it('asks the model with the telecom prompt and schema', async () => {
    const { requests } = await ok('telecom-mobile-bill', 2);
    const body = requests[0]?.body;
    expect(String(body?.['system'])).toMatch(/^You read Spanish phone, mobile and internet/);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toEqual([
      'pages',
      'telecom_bill',
      'telecom_contract',
    ]);
    expect(body?.['max_tokens']).toBe(12_000);
  });

  it('reads a mobile bill with its fee, a premium-rate charge and a penalty', async () => {
    const { extraction, failedChecks, metrics } = await ok('telecom-mobile-bill', 2);
    expect(extraction.documents).toEqual([{ kind: 'telecom_bill', pages: [1, 2] }]);
    expect(extraction.lists.bills?.[0]?.values).toMatchObject({
      periodFrom: '2026-08-01',
      periodTo: '2026-08-31',
      total: 147.97,
    });
    expect(
      extraction.lists.lines?.map((l) => [l.values['kind'], l.values['amount'], l.source]),
    ).toEqual([
      ['fixed_fee', 20.66, 'telecom_bill'],
      ['premium_rate', 1.63, 'telecom_bill'],
      ['penalty', 100, 'telecom_bill'],
    ]);
    expect(failedChecks).toEqual([]);
    expect(metrics).toMatchObject({ review: 'telecom', pages: 2, escalated: false });
  });

  it('reads a commitment, its penalty, the handset and the price review clause', async () => {
    const { extraction } = await ok('telecom-contract-commitment', 2);
    expect(extraction.fields).toMatchObject({
      commitmentStartsOn: value('2025-03-01'),
      commitmentMonths: value(18),
      agreedPenalty: value(150),
      handsetSubsidised: value(true),
      handsetValue: value(240),
      priceReviewIndex: value('ipc_plus'),
    });
    expect(String(extraction.fields.priceReviewText?.value)).toContain('IPC');
    expect(String(extraction.fields.penaltyText?.value)).toContain('proporcional');
  });

  it('answers nothing_read for a page that is no telecom document', async () => {
    const { response, metrics } = await readTelecom('telecom-not-telecom', 1);
    expect(response).toEqual({
      code: 'nothing_read',
      pages: [{ page: 1, kind: 'other', readability: f('not_telecom_document') }],
    });
    expect(metrics.readability).toEqual({ not_telecom_document: 1 });
  });
});
