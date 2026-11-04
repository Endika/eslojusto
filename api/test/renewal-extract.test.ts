import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { SONNET_4_6 } from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import { extract, type ExtractDeps } from '../src/domain/extract';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { f } from './support/fields';
import { recordedReader, type Recording } from './support/recorded';
import { jpeg } from './support/synthetic';

// Hand-written in Bedrock's response shape with the figures of a made-up letter: no model is called.

const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};

async function readRenewal(recording: Recording) {
  const { reader, requests } = recordedReader({ [SONNET_4_6]: recording });
  const deps: ExtractDeps = {
    reader,
    captcha: new FakeCaptcha(),
    signer: createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256'),
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
  };
  const response = await extract(
    {
      files: [photo],
      captchaToken: 'turnstile-token',
      allowance: { type: 'free', token: null },
      review: 'renewal',
    },
    deps,
    {},
  );
  return { response, requests };
}

const value = (v: unknown) => expect.objectContaining({ value: v, source: 'price_change_notice' });

describe('a renewal letter read', () => {
  it('asks the model with the renewal prompt and only the letter’s section', async () => {
    const { requests } = await readRenewal('renewal-letter');
    const body = requests[0]?.body;
    expect(String(body?.['system'])).toMatch(/^You read a Spanish electricity renewal letter/);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toEqual([
      'pages',
      'price_change_notice',
    ]);
  });

  it('reads the letter into the form’s flat fields', async () => {
    const { response } = await readRenewal('renewal-letter');
    if (response.code !== 'ok') throw new Error(response.code);
    expect(response.extraction.documents).toEqual([{ kind: 'price_change_notice', pages: [1] }]);
    expect(response.extraction.fields).toMatchObject({
      letterDate: value('2026-10-31'),
      renewalDate: value('2026-12-10'),
      separateFromBill: value(true),
      isRenewal: value(true),
      powerKwP1: value(5.75),
      powerKwP2: value(5.75),
      powerUnit: value('per_kw_day'),
      currentPowerP1: value(0.110283),
      currentPowerP2: value(0.033469),
      nextPowerP1: value(0.12303),
      nextPowerP2: value(0.052329),
      currentEnergy: value(0.144972),
      nextEnergy: value(0.1678),
      annualKwh: value(4190.2),
      declaredWithoutTax: value(1071.15),
      declaredWithTax: value(1362.36),
    });
    expect(response.extraction.fields.fixedPrice).toBeUndefined();
    expect(response.extraction.fields.currentEnergyP1).toBeUndefined();
    expect(response.failedChecks).toEqual([]);
  });

  it('keeps a price per period and a fixed price when the letter says so', async () => {
    const { response } = await readRenewal('renewal-per-period');
    if (response.code !== 'ok') throw new Error(response.code);
    expect(response.extraction.fields).toMatchObject({
      fixedPrice: value(true),
      powerUnit: value('per_kw_year'),
      currentEnergyP1: value(0.15),
      nextEnergyP3: value(0.11),
    });
    expect(response.extraction.fields.currentEnergy).toBeUndefined();
  });

  it('answers that a bill is not the letter', async () => {
    const { response } = await readRenewal('renewal-bill');
    expect(response).toEqual({
      code: 'nothing_read',
      pages: [{ page: 1, kind: 'other', readability: f('ok') }],
    });
  });
});
