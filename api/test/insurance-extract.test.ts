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

async function readInsurance(recording: Recording, pages: number) {
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
      review: 'insurance',
    },
    deps,
    metrics,
  );
  return { response, requests, metrics };
}

async function ok(recording: Recording, pages: number) {
  const { response, requests, metrics } = await readInsurance(recording, pages);
  if (response.code !== 'ok') throw new Error(response.code);
  return { ...response, requests, metrics };
}

const value = (v: unknown, source = 'insurance_policy') =>
  expect.objectContaining({ value: v, source });

describe('an insurance read', () => {
  it('asks the model with the insurance prompt and schema', async () => {
    const { requests } = await ok('insurance-home-renewal', 3);
    const body = requests[0]?.body;
    expect(String(body?.['system'])).toMatch(/^You read Spanish home and motor insurance/);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toEqual([
      'pages',
      'insurance_policy',
      'insurance_renewal_notice',
    ]);
    expect(body?.['max_tokens']).toBe(5000);
  });

  it('reads a home policy and the notice of its renewal', async () => {
    const { extraction, failedChecks, metrics } = await ok('insurance-home-renewal', 3);
    expect(extraction.documents).toEqual([
      { kind: 'insurance_policy', pages: [1, 2] },
      { kind: 'insurance_renewal_notice', pages: [3] },
    ]);
    expect(extraction.fields).toMatchObject({
      line: value('home'),
      insurerName: value('Seguros de Ficción, S.A.'),
      intermediaryCompanyName: value('Correduría Imaginaria S.L.'),
      expiresOn: value('2027-03-01', 'insurance_renewal_notice'),
      renews: value(true),
      premiumTotal: value(278.72),
      proportionalRuleMarginPercent: value(15),
      noticeOn: value('2027-01-20', 'insurance_renewal_notice'),
      noticeMedium: value('email', 'insurance_renewal_notice'),
      previousPremium: value(278.72, 'insurance_renewal_notice'),
      newPremium: value(301.4, 'insurance_renewal_notice'),
      coverChanges: value(true, 'insurance_renewal_notice'),
    });
    expect(String(extraction.fields.nonRenewalClauseText?.value)).toContain('un mes');
    expect(extraction.lists.sumsInsured?.map((s) => s.values['kind'])).toEqual([
      'building',
      'contents',
    ]);
    expect(extraction.conflicts).toEqual([]);
    expect(failedChecks).toEqual([]);
    expect(metrics).toMatchObject({ review: 'insurance', pages: 3, escalated: false });
  });

  it('reads a motor policy taken out online, without the name of an agent who is a person', async () => {
    const { extraction } = await ok('insurance-car-online', 1);
    expect(extraction.fields).toMatchObject({
      line: value('car'),
      carCover: value('with_voluntary'),
      channel: value('online'),
      concludedOn: value('2026-09-28'),
    });
    expect(extraction.fields.intermediaryCompanyName).toBeUndefined();
    expect(JSON.stringify(extraction)).not.toContain('Mengana');
  });

  it('answers nothing_read for a page that is no insurance document', async () => {
    const { response, metrics } = await readInsurance('insurance-not-insurance', 1);
    expect(response).toEqual({
      code: 'nothing_read',
      pages: [{ page: 1, kind: 'other', readability: f('not_insurance_document') }],
    });
    expect(metrics.readability).toEqual({ not_insurance_document: 1 });
  });
});
