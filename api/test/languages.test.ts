import { describe, expect, it } from 'vitest';
import { SYSTEM_PROMPT } from '../src/adapters/bedrock-reader';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { SONNET_4_6 } from '../src/config';
import { extract, type ExtractDeps } from '../src/domain/extract';
import { READABILITY_DESCRIPTION } from '../src/domain/extraction-schema';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { recordedReader, type Recording } from './support/recorded';
import { jpeg } from './support/synthetic';

// Documents from Spain come in its co-official languages and, from international employers, in
// English. The fixtures are hand-written in Bedrock's response shape: no model is called.

const photo = { mediaType: 'image/jpeg' as const, bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO') };

async function readAs(recording: Recording, pages: number) {
  const { reader } = recordedReader({ [SONNET_4_6]: recording });
  const deps: ExtractDeps = {
    reader,
    captcha: new FakeCaptcha(),
    signer: createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256'),
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
  };
  const files = Array.from({ length: pages }, () => photo);
  const response = await extract(
    { files, captchaToken: 'turnstile-token', allowance: { type: 'free', token: null } },
    deps,
    {},
  );
  if (response.code !== 'ok') throw new Error(response.code);
  for (const p of response.extraction.pages) expect(p.readability.value).toBe('ok');
  return response.extraction;
}

const value = (v: unknown) => expect.objectContaining({ value: v });

describe('documents in the languages of Spain', () => {
  it('names every language and says language is never a reason to set a page aside', () => {
    expect(SYSTEM_PROMPT).toContain('Spanish, Catalan, Basque, Galician or English');
    expect(SYSTEM_PROMPT).toContain('Language alone is never a reason to set a page aside.');
    expect(SYSTEM_PROMPT).toContain(
      'foreign_jurisdiction is an employment document from another country, where Spanish law does not apply',
    );
    expect(READABILITY_DESCRIPTION).toContain('never because of its language');
  });

  it('merges a payslip in Catalan', async () => {
    const { fields } = await readAs('payslip-catalan', 1);
    expect(fields).toMatchObject({
      startDate: value('2021-02-01'),
      payslipTotalAccrued: value(1850),
      extraPayProrated: value(true),
      extraPayProratedAmount: value(250),
    });
  });

  it('adds up a final payslip in Basque by its lines', async () => {
    const { fields } = await readAs('liquidation-basque', 1);
    expect(fields).toMatchObject({
      pending_salary: { value: 800, source: 'payslip' },
      holiday_pay: { value: 540, source: 'payslip' },
      severance: { value: 1050, source: 'payslip' },
    });
  });

  it('merges a settlement and a dismissal letter in Galician', async () => {
    const { fields } = await readAs('settlement-galician', 2);
    expect(fields).toMatchObject({
      endDate: { value: '2026-09-30', source: 'settlement_proposal' },
      cause: { value: 'objective_dismissal', source: 'dismissal_letter' },
      pending_salary: value(1200),
      noticeDaysReceived: value(15),
    });
  });

  it('merges a company certificate and a work history in English', async () => {
    const { fields, lists } = await readAs('certificate-english', 2);
    expect(lists.contracts).toEqual([
      {
        values: { startDate: '2023-01-09', endDate: '2026-08-31' },
        confidence: 'high',
        source: 'work_history',
      },
    ]);
    expect(fields).toMatchObject({
      startDate: value('2023-01-09'),
      cause: value('fixed_term_end'),
      fixedTermType: value('production_circumstances'),
    });
  });
});
