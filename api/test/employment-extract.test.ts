import { describe, expect, it } from 'vitest';
import { createBedrockReader, EMPLOYMENT_SYSTEM_PROMPT } from '../src/adapters/bedrock-reader';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { MODEL_SETTINGS, SONNET_4_6 } from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import { extract, type ExtractDeps, type ExtractMetrics } from '../src/domain/extract';
import { EXTRA_OUTPUT_TOKENS_BY_REVIEW } from '../src/domain/tokens';
import { employmentRecord } from './support/employment-largest';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { f } from './support/fields';
import { recordedReader, type Recording } from './support/recorded';
import { INJECTION, jpeg } from './support/synthetic';

// Hand-written in Bedrock's response shape, with made-up figures, companies and identifiers that
// fail their check digits: no model is called.

const photo: DocumentFile = {
  mediaType: 'image/jpeg',
  bytes: jpeg(1176, 1568, 'DOCUMENTO FICTICIO'),
};

function deps(reader: ExtractDeps['reader']): ExtractDeps {
  return {
    reader,
    captcha: new FakeCaptcha(),
    signer: createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256'),
    payments: new FakePayments({}),
    clock: new FakeClock(),
    models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
  };
}

async function readWith(reader: ExtractDeps['reader'], pages: number, files = [photo]) {
  const metrics: ExtractMetrics = {};
  const response = await extract(
    {
      files: Array.from({ length: pages }, (_, i) => files[i % files.length] ?? photo),
      captchaToken: 'turnstile-token',
      allowance: { type: 'free', token: null },
      review: 'employment',
    },
    deps(reader),
    metrics,
  );
  if (response.code !== 'ok') throw new Error(response.code);
  return { ...response, metrics };
}

async function ok(recording: Recording, pages: number, files?: DocumentFile[]) {
  const recorded = recordedReader({ [SONNET_4_6]: recording });
  const read = await readWith(recorded.reader, pages, files);
  return { ...read, requests: recorded.requests };
}

const value = (v: unknown, source = 'employment_contract') =>
  expect.objectContaining({ value: v, source });

describe('an employment read', () => {
  it('asks the model with the employment prompt, schema and output room', async () => {
    const { requests } = await ok('employment-permanent', 3);
    const body = requests[0]?.body;
    expect(body?.['system']).toBe(EMPLOYMENT_SYSTEM_PROMPT);
    const tool = (body?.['tools'] as { input_schema: { properties: object } }[])[0];
    expect(Object.keys(tool?.input_schema.properties ?? {})).toContain('employment_contract');
    expect(body?.['max_tokens']).toBe(
      (MODEL_SETTINGS[SONNET_4_6]?.maxTokens ?? 0) + EXTRA_OUTPUT_TOKENS_BY_REVIEW.employment,
    );
  });

  it('reads a whole permanent contract', async () => {
    const { extraction, failedChecks, metrics } = await ok('employment-permanent', 3);
    expect(extraction.documents).toEqual([{ kind: 'employment_contract', pages: [1, 2, 3] }]);
    expect(extraction.fields).toMatchObject({
      employerType: value('company'),
      companyName: value('Talleres Inventados del Norte S.L.'),
      companyTaxId: value('B00000000'),
      workplaceRegion: value('MD'),
      startDate: value('2026-10-07'),
      modality: value('permanent'),
      contractKey: value('100'),
      salaryAmount: value(1600),
      salaryPeriod: value('month'),
      annualSalaryAmount: value(22400),
      payments: value(14),
      weeklyHours: value(40),
      holidayDays: value(30),
      holidayUnit: value('calendar'),
      trialAmount: value(6),
      trialUnit: value('months'),
      agreementCode: value('28000000011900'),
    });
    expect(extraction.lists.salaryParts?.map((p) => p.values['kind'])).toEqual([
      'base',
      'fixed_complement',
    ]);
    expect(extraction.lists.clauses?.[0]?.values).toMatchObject({
      label: 'non_compete',
      months: 12,
      compensationStated: true,
    });
    expect(String(extraction.lists.clauses?.[0]?.values['literal'])).toContain('[nombre]');
    expect(extraction.lists.information).toHaveLength(17);
    expect(extraction.truncated).toBe(false);
    expect(failedChecks).toEqual([]);
    expect(metrics).toMatchObject({ review: 'employment', pages: 3, escalated: false });
    expect(metrics).not.toHaveProperty('truncated');
  });

  it('reads a fixed-term production contract with its cause word for word', async () => {
    const { extraction } = await ok('employment-production', 2);
    expect(extraction.fields).toMatchObject({
      modality: value('production'),
      contractKey: value('402'),
      endDate: value('2026-11-30'),
      durationMonths: value(6),
      workplaceRegion: value('PV'),
    });
    expect(String(extraction.fields.causeText?.value)).toMatch(
      /^Incremento ocasional e imprevisible .* durante seis meses\.$/,
    );
  });

  it('reads a replacement contract that names no one', async () => {
    const { extraction } = await ok('employment-replacement', 2);
    expect(extraction.fields).toMatchObject({
      modality: value('replacement'),
      replacedPersonNamed: value(false),
      replacementCauseStated: value(true),
    });
  });

  it('reads a training contract with its plan', async () => {
    const { extraction } = await ok('employment-training', 3);
    expect(extraction.fields).toMatchObject({
      modality: value('training_alternance'),
      trainingType: value('training_alternance'),
      planAttached: value(true),
      effectiveWorkPercent: value(65),
      endDate: value('2027-09-14'),
    });
  });

  it('reads a contract with six payslips, their lines and the agreement they print', async () => {
    const { extraction, failedChecks } = await ok('employment-contract-payslips', 8);
    expect(extraction.documents.map((d) => d.kind)).toEqual([
      'employment_contract',
      ...Array<string>(6).fill('payslip'),
    ]);
    expect(extraction.documents[1]).toEqual({ kind: 'payslip', pages: [3], month: '2026-03' });
    expect(extraction.lists.payslips).toHaveLength(6);
    expect(extraction.lists.payslips?.every((p) => p.source === 'payslip')).toBe(true);
    expect(extraction.lists.payslips?.map((p) => p.values['incidents'])).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ]);
    expect(extraction.lists.lines).toHaveLength(13);
    expect(extraction.fields).toMatchObject({
      partTime: value(true),
      weeklyHours: value(20),
      complementaryPercent: value(30),
      agreementName: value('Convenio colectivo estatal de grandes almacenes', 'payslip'),
      category: value('Dependiente mayor', 'payslip'),
    });
    expect(failedChecks).toEqual([]);
  });

  it('reads a work history with five contracts and no person’s name', async () => {
    const { extraction } = await ok('employment-work-history', 2);
    const rows = extraction.lists.contracts ?? [];
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.source === 'work_history')).toBe(true);
    expect(rows.map((r) => r.values['contractKey'])).toEqual(['402', '402', '100', '410', '402']);
    expect(rows[2]?.values).toEqual({
      startDate: '2023-06-01',
      endDate: '2023-08-31',
      employerType: 'person',
      accountCode: '48/1111111/11',
      contractKey: '100',
      partTimeCoefficient: 500,
    });
    expect(rows[4]?.values).not.toHaveProperty('endDate');
  });

  it('reads a net job offer under fields of its own', async () => {
    const { extraction } = await ok('employment-offer-net', 1);
    expect(extraction.fields).toEqual({
      offerPosition: { ...f('Administrativo/a contable'), source: 'job_offer' },
      offerSalaryAmount: { ...f(1300), source: 'job_offer' },
      offerSalaryPeriod: { ...f('month'), source: 'job_offer' },
      offerNet: { ...f(true), source: 'job_offer' },
      offerVariable: { ...f(false), source: 'job_offer' },
      offerWeeklyHours: { ...f(40), source: 'job_offer' },
      offerModality: { ...f('permanent'), source: 'job_offer' },
      offerRemote: { ...f('hybrid'), source: 'job_offer' },
      offerPublishedOn: { ...f('2026-08-20'), source: 'job_offer' },
    });
  });

  it('keeps nothing an injected page made the model add', async () => {
    const injected: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400, INJECTION) };
    const { extraction } = await ok('employment-injected', 2, [photo, injected]);
    expect(extraction.fields).toEqual({
      employerType: { ...f('company'), source: 'employment_contract' },
      companyName: { ...f('Talleres Inventados del Norte S.L.'), source: 'employment_contract' },
      startDate: { ...f('2026-10-07'), source: 'employment_contract' },
      modality: { ...f('permanent'), source: 'employment_contract' },
      weeklyHours: { ...f(40), source: 'employment_contract' },
    });
    expect(extraction.lists).toEqual({
      information: [
        {
          values: { element: 'a', presence: 'present' },
          confidence: 'high',
          source: 'employment_contract',
        },
      ],
    });
    expect(extraction.pages.map((p) => p.page)).toEqual([1]);
    expect(JSON.stringify(extraction)).not.toMatch(/99999|admin|system prompt|note|severance/);
  });

  it('reads a contract in Basque', async () => {
    const { extraction } = await ok('employment-basque', 2);
    expect(extraction.fields).toMatchObject({
      modalityText: value('Lan-kontratu mugagabea, lanaldi osoan'),
      agreementName: value('Bizkaiko metalgintzako hitzarmen kolektiboa'),
      scheduleText: value('Astelehenetik ostiralera, 8:00etatik 16:00etara.'),
      holidayUnit: value('working'),
      salaryPeriod: value('year'),
    });
  });

  it('reads a household employment contract as a hint, without the employer’s name', async () => {
    const { extraction } = await ok('employment-household', 1);
    expect(extraction.lists.relationshipHints).toEqual([
      { values: { hint: 'household' }, confidence: 'high', source: 'employment_contract' },
    ]);
    expect(extraction.fields).toMatchObject({
      employerType: value('person'),
      salaryPeriod: value('hour'),
      salaryAmount: value(9.55),
    });
    expect(extraction.fields).not.toHaveProperty('companyName');
    // The schedule held a phone number, so it goes with it.
    expect(extraction.fields).not.toHaveProperty('scheduleText');
    expect(JSON.stringify(extraction)).not.toMatch(/Fulanita|600 123 456/);
  });

  it('says when a list came back at its maximum, and logs only that', async () => {
    const reader = createBedrockReader(async () =>
      JSON.stringify({
        content: [{ type: 'tool_use', name: 'record_extraction', input: employmentRecord() }],
        stop_reason: 'tool_use',
        usage: { input_tokens: 90_000, output_tokens: 11_000 },
      }),
    );
    const { extraction, metrics } = await readWith(reader, 25);
    expect(extraction.truncated).toBe(true);
    expect(extraction.lists.lines).toHaveLength(150);
    expect(metrics.truncated).toBe(true);
  });
});
