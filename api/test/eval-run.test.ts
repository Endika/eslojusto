import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { MODEL_PRICES_USD_PER_MTOK, SONNET_4_6, SONNET_5_5 } from '../src/config';
import type { DocumentReader, ModelRead } from '../src/domain/ports';
import { MAX_ESTIMATED_INPUT_TOKENS } from '../src/domain/tokens';
import { SpendCounter, worstCaseUsd } from '../eval/budget';
import type { CreditBankCase } from '../eval/credit-schema';
import type { EmploymentBankCase } from '../eval/employment-schema';
import { parseEvalArgs, parseEvalEnv, selectCases } from '../eval/env';
import {
  creditBank,
  employmentBank,
  evaluate,
  expectedCreditPages,
  expectedEmploymentPages,
  expectedInsurancePages,
  expectedPages,
  insuranceBank,
  rentalBank,
  type EvalBank,
  type EvalCase,
  type EvalDeps,
  type EvalPack,
  type ExpectedPage,
} from '../eval/evaluate';
import type { InsuranceBankCase } from '../eval/insurance-schema';
import type { BankCase } from '../eval/schema';
import { CREDIT_MERGE_RULES } from '../src/domain/credit-merge';
import { INSURANCE_MERGE_RULES } from '../src/domain/insurance-merge';
import type { From } from '../src/domain/merge';
import {
  BANK,
  bankSheetsOf,
  CREDIT_BANK,
  EMPLOYMENT_BANK,
  employmentSheetsOf,
  INSURANCE_BANK,
  sheetsOf,
} from './support/bank';
import { FakeClock } from './support/fakes';
import { jpeg } from './support/synthetic';

const API_DIR = fileURLToPath(new URL('..', import.meta.url));
const SONNET_PRICE = {
  [SONNET_4_6]: MODEL_PRICES_USD_PER_MTOK[SONNET_4_6] ?? { input: 0, output: 0 },
};

describe('starting an evaluation run', () => {
  it.each([
    [{}, 'EVAL_CONFIRM=yes'],
    [{ EVAL_MAX_USD: '3' }, 'EVAL_CONFIRM=yes'],
    [{ EVAL_CONFIRM: 'true', EVAL_MAX_USD: '3' }, 'EVAL_CONFIRM=yes'],
    [{ EVAL_CONFIRM: 'yes' }, 'EVAL_MAX_USD'],
    [{ EVAL_CONFIRM: 'yes', EVAL_MAX_USD: '' }, 'EVAL_MAX_USD'],
    [{ EVAL_CONFIRM: 'yes', EVAL_MAX_USD: 'three' }, 'EVAL_MAX_USD'],
    [{ EVAL_CONFIRM: 'yes', EVAL_MAX_USD: '0' }, 'EVAL_MAX_USD'],
    [{ EVAL_CONFIRM: 'yes', EVAL_MAX_USD: '-3' }, 'EVAL_MAX_USD'],
  ])('refuses %j', (env, needed) => {
    const parsed = parseEvalEnv(env);
    expect(parsed.ok).toBe(false);
    expect(!parsed.ok && parsed.message).toContain(needed);
  });

  it('takes a confirmation and a cap', () => {
    expect(parseEvalEnv({ EVAL_CONFIRM: 'yes', EVAL_MAX_USD: '3' })).toEqual({
      ok: true,
      maxUsd: 3,
    });
  });

  // The script itself, without the variables: it must exit before loading the AWS adapters.
  it.each([
    [{}, 'EVAL_CONFIRM=yes'],
    [{ EVAL_CONFIRM: 'yes' }, 'EVAL_MAX_USD'],
  ])('npm run eval with %j exits with an error', (vars, needed) => {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env['PATH'],
      HOME: process.env['HOME'],
      ...vars,
    };
    const run = spawnSync('node', ['--import', 'tsx', 'eval/run.ts'], {
      cwd: API_DIR,
      env,
      encoding: 'utf8',
      timeout: 30_000,
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain(needed);
    expect(run.stdout).toBe('');
  });

  it('reads the rental bank unless told which review and which cases', () => {
    expect(parseEvalArgs([])).toEqual({ review: 'rental', cases: 'eval/cases' });
    expect(parseEvalArgs(['--review', 'employment'])).toEqual({
      review: 'employment',
      cases: 'eval/cases/employment',
    });
    expect(parseEvalArgs(['--review', 'employment', '--cases', 'eval/cases/employment/'])).toEqual({
      review: 'employment',
      cases: 'eval/cases/employment',
    });
    expect(parseEvalArgs(['--review', 'credit'])).toEqual({
      review: 'credit',
      cases: 'eval/cases/credit',
    });
    expect(parseEvalArgs(['--review', 'insurance'])).toEqual({
      review: 'insurance',
      cases: 'eval/cases/insurance',
    });
    expect(
      parseEvalArgs(['--review', 'employment', '--only', 'replacement-named,household-gate']),
    ).toEqual({
      review: 'employment',
      cases: 'eval/cases/employment',
      only: 'replacement-named,household-gate',
    });
  });

  it.each([
    [['--review', 'final_pay'], 'rental, employment, credit or insurance'],
    [['--review'], '--review takes a value'],
    [['--review', 'employment', '--cases'], '--cases takes a value'],
    [['--cases', '--review', 'employment'], '--cases takes a value'],
    [['--only'], '--only takes a value'],
  ])('refuses the arguments %j', (argv, message) => {
    expect(() => parseEvalArgs(argv)).toThrow(message);
  });

  it('reads the packs marked for the AI pass unless told otherwise', () => {
    expect(selectCases(BANK, undefined).map((c) => c.id)).toEqual(
      BANK.filter((c) => c.eval).map((c) => c.id),
    );
    expect(selectCases(BANK, 'all')).toHaveLength(BANK.length);
    expect(selectCases(BANK, 'seasonal-gate').map((c) => c.id)).toEqual(['seasonal-gate']);
    expect(() => selectCases(BANK, 'no-such-case')).toThrow('No such case');
  });
});

describe('the worst case of a pack', () => {
  const base = {
    prices: { ...SONNET_PRICE, [SONNET_5_5]: { input: 3.3, output: 16.5 } },
    maxOutputTokens: { [SONNET_4_6]: 5000, [SONNET_5_5]: 16000 },
    maxInputTokens: MAX_ESTIMATED_INPUT_TOKENS,
  };

  it('is one Sonnet 4.6 read at the largest input and max_tokens: about 0,40 USD', () => {
    const worst = worstCaseUsd({
      ...base,
      models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
    });
    expect(worst).toBeCloseTo((96_000 * 3.3 + 5000 * 16.5) / 1e6, 10);
    expect(worst).toBeLessThan(0.4);
  });

  it('adds the escalation read when it is another model', () => {
    const one = worstCaseUsd({ ...base, models: { primary: SONNET_4_6, escalation: SONNET_4_6 } });
    const two = worstCaseUsd({ ...base, models: { primary: SONNET_4_6, escalation: SONNET_5_5 } });
    expect(two).toBeCloseTo(one + (96_000 * 3.3 + 16_000 * 16.5) / 1e6, 10);
  });

  it('refuses a model without a price', () => {
    expect(() =>
      worstCaseUsd({
        ...base,
        prices: {},
        models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
      }),
    ).toThrow('No price');
  });

  it('a counter affords a pack only while the cap holds it', () => {
    const counter = new SpendCounter(1);
    expect(counter.canAfford(1)).toBe(true);
    counter.add(0.6);
    expect(counter.canAfford(0.4)).toBe(true);
    expect(counter.canAfford(0.41)).toBe(false);
  });
});

// A read that states exactly what the case expects.
function perfectRead(c: BankCase): Record<string, unknown> {
  const pages = expectedPages(c, sheetsOf).map((p, i) => ({
    page: i + 1,
    kind: p.kind,
    document: i + 1,
    readability: { value: p.readability, confidence: 'high' },
    confidence: 'high',
  }));
  const SECTION: Record<string, string> = {
    guarantees: 'lease',
    charges: 'lease',
    notices: 'rent_update_notice',
    receipts: 'rent_receipt',
    invoices: 'agency_invoice',
    returns: 'deposit_return',
    deductions: 'deposit_return',
  };
  const sections: Record<string, { [k: string]: unknown }> = {};
  const section = (kind: string) => (sections[kind] ??= {});
  for (const [name, value] of Object.entries(c.expected.extraction.fields))
    section(name === 'keysReturnedOn' ? 'deposit_return' : 'lease')[name] = {
      value,
      confidence: 'high',
    };
  for (const [list, rows] of Object.entries(c.expected.extraction.lists))
    section(SECTION[list] ?? 'lease')[list] = rows.map((r) => ({ ...r, confidence: 'high' }));
  return { pages, ...sections };
}

const packOf = (c: BankCase): EvalPack => ({
  bankCase: c,
  files: expectedPages(c, sheetsOf).map(() => ({
    mediaType: 'image/jpeg',
    bytes: jpeg(1000, 1414),
  })),
});

const deps = (reader: EvalDeps['reader'], maxUsd: number): EvalDeps => ({
  reader,
  signer: createHmacSigner('k'.repeat(32)),
  clock: new FakeClock(),
  models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
  prices: SONNET_PRICE,
  maxOutputTokens: { [SONNET_4_6]: 5000 },
  maxInputTokens: MAX_ESTIMATED_INPUT_TOKENS,
  maxUsd,
  truncatedReads: () => 0,
});

// The n-th read, counted from 1, answers `answer(n)`.
class FixedReader implements DocumentReader {
  readonly calls: Parameters<DocumentReader['read']>[0][] = [];
  constructor(private readonly answer: (n: number) => ModelRead) {}
  async read(request: Parameters<DocumentReader['read']>[0]) {
    this.calls.push(request);
    return this.answer(this.calls.length);
  }
}

describe('the spend counter of a run', () => {
  const packs = BANK.filter((c) => c.eval && c.expected.extraction.outcome === 'ok').map(packOf);

  it('stops before a pack whose worst case would cross the cap', async () => {
    // 30.000 in and 2.000 out at Sonnet 4.6 prices: 0,132 USD a pack, 0,3993 USD at worst.
    const reader = new FixedReader(() => ({
      toolInput: null,
      inputTokens: 30_000,
      outputTokens: 2000,
    }));
    const report = await evaluate(packs, rentalBank(sheetsOf), deps(reader, 1));
    // After five packs 0,66 USD is spent, and 0,66 + 0,3993 > 1.
    expect(reader.calls).toHaveLength(5);
    expect(report.read).toBe(5);
    expect(report.stoppedBefore).toBe(packs[5]?.bankCase.id);
    expect(report.costUsd).toBeCloseTo(0.66, 10);
    expect(report.costUsd + report.worstCasePerPackUsd).toBeGreaterThan(1);
  });

  it('never crosses the cap, even when every read costs the worst case', async () => {
    const reader = new FixedReader(() => ({
      toolInput: null,
      inputTokens: MAX_ESTIMATED_INPUT_TOKENS,
      outputTokens: 5000,
    }));
    const report = await evaluate(packs, rentalBank(sheetsOf), deps(reader, 1));
    expect(report.read).toBe(2);
    expect(report.costUsd).toBeLessThanOrEqual(1);
  });

  it('reads nothing when the cap cannot hold one pack', async () => {
    const reader = new FixedReader(() => ({ toolInput: null, inputTokens: 1, outputTokens: 1 }));
    const report = await evaluate(packs, rentalBank(sheetsOf), deps(reader, 0.39));
    expect(reader.calls).toHaveLength(0);
    expect(report.stoppedBefore).toBe(packs[0]?.bankCase.id);
    expect(report.costUsd).toBe(0);
  });
});

describe('scoring a run', () => {
  const cases = BANK.filter((c) => c.eval && c.expected.extraction.outcome === 'ok');

  it('a read that states what each case expects scores every field and page right', async () => {
    const reader = new FixedReader((n) => {
      const c = cases[n - 1];
      if (c === undefined) throw new Error('no case');
      return { toolInput: perfectRead(c), inputTokens: 20_000, outputTokens: 1500 };
    });
    const report = await evaluate(cases.map(packOf), rentalBank(sheetsOf), deps(reader, 100));
    expect(report.read).toBe(cases.length);
    for (const t of Object.values(report.accuracy.byField)) expect(t.accuracy).toBe(1);
    for (const t of Object.values(report.accuracy.byPageKind)) {
      expect(t.accuracy).toBe(1);
      expect(t.readabilityCorrect).toBe(t.expected);
    }
    expect(report.personsTranscribed).toBe(0);
    expect(report.nothingRead).toEqual({ expected: 0, got: 0, agreed: 0 });
  });

  it("counts a person's DNI or IBAN the model wrote, however it spaced it", async () => {
    const c = cases[0];
    if (c === undefined) throw new Error('no case');
    const lease = c.pages[0];
    const dni = String(lease?.data['tenantDni']);
    const iban = String(lease?.data['iban']).replace(/ /g, '');
    const read = perfectRead(c);
    const reader = new FixedReader(() => ({
      toolInput: {
        ...read,
        lease: {
          ...(read['lease'] as object),
          feesText: { value: `${dni} ${iban}`, confidence: 'high' },
        },
      },
      inputTokens: 20_000,
      outputTokens: 1500,
    }));
    const report = await evaluate([packOf(c)], rentalBank(sheetsOf), deps(reader, 100));
    expect(report.personsTranscribed).toBe(2);
  });

  it('scores a pack read as nothing against the ones that expect it', async () => {
    const unreadable = BANK.filter((c) => c.expected.extraction.outcome === 'nothing_read');
    const reader = new FixedReader((n) => {
      const c = unreadable[n - 1];
      if (c === undefined) throw new Error('no case');
      const pages = expectedPages(c, sheetsOf).map((p, i) => ({
        page: i + 1,
        kind: p.kind,
        document: 1,
        readability: { value: p.readability, confidence: 'high' },
        confidence: 'high',
      }));
      return { toolInput: { pages }, inputTokens: 10_000, outputTokens: 300 };
    });
    const report = await evaluate(unreadable.map(packOf), rentalBank(sheetsOf), deps(reader, 100));
    expect(report.nothingRead).toEqual({
      expected: unreadable.length,
      got: unreadable.length,
      agreed: unreadable.length,
    });
  });
});

// An employment read that states exactly what the case expects.
function perfectEmploymentRead(c: EmploymentBankCase): Record<string, unknown> {
  const pages = expectedEmploymentPages(c, employmentSheetsOf).map((p, i) => ({
    page: i + 1,
    kind: p.kind,
    document: i + 1,
    readability: { value: p.readability, confidence: 'high' },
    confidence: 'high',
  }));
  const SECTION: Record<string, string> = {
    payslips: 'employment_payslips',
    contracts: 'employment_work_history',
  };
  const sections: Record<string, { [k: string]: unknown }> = {};
  const section = (kind: string) => (sections[kind] ??= {});
  for (const [name, value] of Object.entries(c.expected.extraction.fields)) {
    const offer = /^offer([A-Z].*)$/.exec(name)?.[1];
    if (offer === undefined) section('employment_contract')[name] = { value, confidence: 'high' };
    else
      section('job_offer')[`${offer.charAt(0).toLowerCase()}${offer.slice(1)}`] = {
        value,
        confidence: 'high',
      };
  }
  for (const [list, rows] of Object.entries(c.expected.extraction.lists))
    section(SECTION[list] ?? 'employment_contract')[list] = rows.map((r) => ({
      ...r,
      ...(list === 'clauses' ? { literal: 'Texto de la cláusula.' } : {}),
      confidence: 'high',
    }));
  return { pages, ...sections };
}

const employmentPackOf = (c: EmploymentBankCase): EvalPack<EmploymentBankCase> => ({
  bankCase: c,
  files: expectedEmploymentPages(c, employmentSheetsOf).map(() => ({
    mediaType: 'image/jpeg',
    bytes: jpeg(1000, 1414),
  })),
});

// max_tokens of an employment read: Sonnet 4.6's 5,000 and the review's 7,000 more.
const employmentDeps = (reader: EvalDeps['reader'], maxUsd: number): EvalDeps => ({
  ...deps(reader, maxUsd),
  maxOutputTokens: { [SONNET_4_6]: 12_000 },
});

describe('an evaluation run over the employment bank', () => {
  const bank = employmentBank(employmentSheetsOf);
  const hard = EMPLOYMENT_BANK.filter((c) => c.eval);

  it('reads the fifteen hard packs by default', () => {
    expect(selectCases(EMPLOYMENT_BANK, undefined)).toHaveLength(15);
  });

  it('counts the worst case of an employment pack at about 0,51 USD', () => {
    const worst = worstCaseUsd({
      models: { primary: SONNET_4_6, escalation: SONNET_4_6 },
      prices: SONNET_PRICE,
      maxOutputTokens: { [SONNET_4_6]: 12_000 },
      maxInputTokens: MAX_ESTIMATED_INPUT_TOKENS,
    });
    expect(worst).toBeCloseTo((96_000 * 3.3 + 12_000 * 16.5) / 1e6, 10);
  });

  it('stops before an employment pack whose worst case would cross a 3 USD cap', async () => {
    // 40.000 in and 6.000 out: 0,231 USD a pack, against a worst case of 0,5148 USD.
    const reader = new FixedReader(() => ({
      toolInput: null,
      inputTokens: 40_000,
      outputTokens: 6000,
    }));
    const report = await evaluate(hard.map(employmentPackOf), bank, employmentDeps(reader, 3));
    // After eleven packs 2,541 USD is spent, and 2,541 + 0,5148 > 3.
    expect(reader.calls).toHaveLength(11);
    expect(report.stoppedBefore).toBe(hard[11]?.id);
    expect(report.costUsd).toBeCloseTo(2.541, 10);
    expect(report.costUsd).toBeLessThanOrEqual(3);
    for (const call of reader.calls) expect(call.review).toBe('employment');
  });

  it('a read that states what each case expects scores every field and page right', async () => {
    const readable = hard.filter((c) => c.expected.extraction.outcome === 'ok');
    const reader = new FixedReader((n) => {
      const c = readable[n - 1];
      if (c === undefined) throw new Error('no case');
      return { toolInput: perfectEmploymentRead(c), inputTokens: 20_000, outputTokens: 3000 };
    });
    const report = await evaluate(
      readable.map(employmentPackOf),
      bank,
      employmentDeps(reader, 100),
    );
    expect(report.read).toBe(readable.length);
    for (const [name, t] of Object.entries(report.accuracy.byField))
      expect(t.accuracy, name).toBe(1);
    for (const [kind, t] of Object.entries(report.accuracy.byPageKind)) {
      expect(t.accuracy, kind).toBe(1);
      expect(t.readabilityCorrect, kind).toBe(t.expected);
    }
    expect(report.personsTranscribed).toBe(0);
  });

  it('counts the name of the person replaced when the model writes it', async () => {
    const c = EMPLOYMENT_BANK.find((x) => x.id === 'replacement-named');
    if (c === undefined) throw new Error('no case');
    const name = String(c.pages[0]?.data['replacedName']);
    const read = perfectEmploymentRead(c);
    const reader = new FixedReader(() => ({
      toolInput: {
        ...read,
        employment_contract: {
          ...(read['employment_contract'] as object),
          causeText: { value: `Sustituir a ${name}.`, confidence: 'high' },
        },
      },
      inputTokens: 20_000,
      outputTokens: 3000,
    }));
    const report = await evaluate([employmentPackOf(c)], bank, employmentDeps(reader, 100));
    expect(report.personsTranscribed).toBe(1);
  });

  describe('a pack that misses a field', () => {
    const c = EMPLOYMENT_BANK.find((x) => x.id === 'replacement-named');
    if (c === undefined) throw new Error('no case');
    const perfect = perfectEmploymentRead(c);

    it('keeps what the model wrote and what the domain made of it', async () => {
      // The contract's section sent as a JSON string: validation leaves it out whole.
      const toolInput = {
        ...perfect,
        employment_contract: JSON.stringify(perfect['employment_contract']),
      };
      const reader = new FixedReader(() => ({ toolInput, inputTokens: 20_000, outputTokens: 900 }));
      const report = await evaluate([employmentPackOf(c)], bank, employmentDeps(reader, 100));
      const pack = report.perPack[0];
      expect(pack?.code).toBe('nothing_read');
      expect(pack?.reads).toEqual([
        expect.objectContaining({
          model: SONNET_4_6,
          toolInput,
          dropped: 1,
          unclassified: 0,
          sections: [],
          doubtful: true,
          extraction: expect.objectContaining({ fields: {}, lists: {} }),
        }),
      ]);
    });

    it('keeps the merged extraction of a read that came back short', async () => {
      const contract = perfect['employment_contract'] as Record<string, unknown>;
      const { trialUnit: _trialUnit, ...rest } = contract;
      const reader = new FixedReader(() => ({
        toolInput: { ...perfect, employment_contract: rest },
        inputTokens: 20_000,
        outputTokens: 900,
      }));
      const report = await evaluate([employmentPackOf(c)], bank, employmentDeps(reader, 100));
      const read = report.perPack[0]?.reads?.[0];
      expect(read?.sections).toEqual(['employment_contract']);
      expect(read?.extraction.fields).toHaveProperty('trialAmount');
      expect(read?.extraction.fields).not.toHaveProperty('trialUnit');
    });

    it('keeps nothing of a pack that scores every field', async () => {
      const reader = new FixedReader(() => ({
        toolInput: perfect,
        inputTokens: 20_000,
        outputTokens: 900,
      }));
      const report = await evaluate([employmentPackOf(c)], bank, employmentDeps(reader, 100));
      expect(report.perPack[0]?.fields.correct).toBe(report.perPack[0]?.fields.expected);
      expect(report.perPack[0]).not.toHaveProperty('reads');
    });
  });
});

// A credit or insurance read that states exactly what the case expects: each field in the first
// section its response takes it from among the pack's documents, each list in the section that
// holds it.
function perfectFinanceRead(
  pages: readonly ExpectedPage[],
  expected: CreditBankCase['expected']['extraction'],
  rules: Readonly<Record<string, readonly From[]>>,
  listSections: Readonly<Record<string, readonly string[]>>,
): Record<string, unknown> {
  const kinds = new Set(pages.map((p) => p.kind));
  const sections: Record<string, { [k: string]: unknown }> = {};
  const section = (kind: string) => (sections[kind] ??= {});
  for (const [name, value] of Object.entries(expected.fields)) {
    const from = rules[name]?.find(([kind]) => kinds.has(kind));
    if (from === undefined) throw new Error(`no document for ${name}`);
    section(from[0])[from[1] === '' ? name : from[1]] = { value, confidence: 'high' };
  }
  for (const [list, rows] of Object.entries(expected.lists)) {
    const kind = listSections[list]?.find((k) => kinds.has(k));
    if (kind === undefined) throw new Error(`no document for ${list}`);
    section(kind)[list] = rows.map((r) => ({ ...r, confidence: 'high' }));
  }
  return {
    pages: pages.map((p, i) => ({
      page: i + 1,
      kind: p.kind,
      document: i + 1,
      readability: { value: p.readability, confidence: 'high' },
      confidence: 'high',
    })),
    ...sections,
  };
}

const CREDIT_LISTS = {
  charges: ['credit_agreement', 'revolving_agreement'],
  schedule: ['amortization_schedule'],
  statements: ['card_statement'],
};
const INSURANCE_LISTS = { sumsInsured: ['insurance_policy'] };

const creditBankOf = creditBank(bankSheetsOf);
const insuranceBankOf = insuranceBank(bankSheetsOf);

const packFor =
  <C extends EvalCase & { readonly eval: boolean }>(bank: EvalBank<C>) =>
  (c: C): EvalPack<C> => ({
    bankCase: c,
    files: bank.pagesOf(c).map(() => ({ mediaType: 'image/jpeg', bytes: jpeg(1000, 1414) })),
  });

const perfectCreditRead = (c: CreditBankCase) =>
  perfectFinanceRead(
    expectedCreditPages(c, bankSheetsOf),
    c.expected.extraction,
    CREDIT_MERGE_RULES,
    CREDIT_LISTS,
  );
const perfectInsuranceRead = (c: InsuranceBankCase) =>
  perfectFinanceRead(
    expectedInsurancePages(c, bankSheetsOf),
    c.expected.extraction,
    INSURANCE_MERGE_RULES,
    INSURANCE_LISTS,
  );

describe('an evaluation run over the credit and insurance banks', () => {
  it('reads fifteen hard packs between them by default, ten of credit and five of insurance', () => {
    expect(selectCases(CREDIT_BANK, undefined)).toHaveLength(10);
    expect(selectCases(INSURANCE_BANK, undefined)).toHaveLength(5);
  });

  it('stops before a credit pack whose worst case would cross the 2 USD of its share', async () => {
    // A credit read gets the employment room to write: 60.000 in and 8.000 out is 0,33 USD a
    // pack, against a worst case of 0,5148 USD.
    const hard = CREDIT_BANK.filter((c) => c.eval);
    const reader = new FixedReader(() => ({
      toolInput: null,
      inputTokens: 60_000,
      outputTokens: 8000,
    }));
    const report = await evaluate(
      hard.map(packFor(creditBankOf)),
      creditBankOf,
      employmentDeps(reader, 2),
    );
    // After five packs 1,65 USD is spent, and 1,65 + 0,5148 > 2.
    expect(reader.calls).toHaveLength(5);
    expect(report.stoppedBefore).toBe(hard[5]?.id);
    expect(report.costUsd).toBeCloseTo(1.65, 10);
    expect(report.costUsd).toBeLessThanOrEqual(2);
    for (const call of reader.calls) expect(call.review).toBe('credit');
  });

  it('stops before an insurance pack whose worst case would cross the 1 USD of its share', async () => {
    // Every read at the worst case of 96.000 in and 5.000 out: 0,3993 USD a pack.
    const reader = new FixedReader(() => ({
      toolInput: null,
      inputTokens: MAX_ESTIMATED_INPUT_TOKENS,
      outputTokens: 5000,
    }));
    const hard = INSURANCE_BANK.filter((c) => c.eval);
    const report = await evaluate(
      hard.map(packFor(insuranceBankOf)),
      insuranceBankOf,
      deps(reader, 1),
    );
    // After two packs 0,7986 USD is spent, and 0,7986 + 0,3993 > 1.
    expect(reader.calls).toHaveLength(2);
    expect(report.stoppedBefore).toBe(hard[2]?.id);
    expect(report.costUsd).toBeCloseTo(0.7986, 10);
    for (const call of reader.calls) expect(call.review).toBe('insurance');
  });

  it('a read that states what each credit case expects scores every field and page right', async () => {
    const readable = CREDIT_BANK.filter((c) => c.expected.extraction.outcome === 'ok');
    const reader = new FixedReader((n) => {
      const c = readable[n - 1];
      if (c === undefined) throw new Error('no case');
      return { toolInput: perfectCreditRead(c), inputTokens: 20_000, outputTokens: 3000 };
    });
    const report = await evaluate(
      readable.map(packFor(creditBankOf)),
      creditBankOf,
      employmentDeps(reader, 100),
    );
    expect(report.read).toBe(readable.length);
    for (const [name, t] of Object.entries(report.accuracy.byField))
      expect(t.accuracy, name).toBe(1);
    for (const [kind, t] of Object.entries(report.accuracy.byPageKind)) {
      expect(t.accuracy, kind).toBe(1);
      expect(t.readabilityCorrect, kind).toBe(t.expected);
    }
    expect(report.conflicts).toBe(0);
    expect(report.personsTranscribed).toBe(0);
  });

  it('a read that states what each insurance case expects scores every field and page right', async () => {
    const readable = INSURANCE_BANK.filter((c) => c.expected.extraction.outcome === 'ok');
    const reader = new FixedReader((n) => {
      const c = readable[n - 1];
      if (c === undefined) throw new Error('no case');
      return { toolInput: perfectInsuranceRead(c), inputTokens: 15_000, outputTokens: 1500 };
    });
    const report = await evaluate(
      readable.map(packFor(insuranceBankOf)),
      insuranceBankOf,
      deps(reader, 100),
    );
    expect(report.read).toBe(readable.length);
    for (const [name, t] of Object.entries(report.accuracy.byField))
      expect(t.accuracy, name).toBe(1);
    for (const [kind, t] of Object.entries(report.accuracy.byPageKind)) {
      expect(t.accuracy, kind).toBe(1);
      expect(t.readabilityCorrect, kind).toBe(t.expected);
    }
    expect(report.personsTranscribed).toBe(0);
  });

  it("counts a borrower's DNI and an insurer's staff member the model wrote", async () => {
    const loan = CREDIT_BANK.find((x) => x.id === 'personal-loan-opening-deducted-2019');
    const policy = INSURANCE_BANK.find((x) => x.id === 'home-renewal-notice-on-time');
    if (loan === undefined || policy === undefined) throw new Error('no case');
    const dni = String(loan.pages[0]?.data['borrowerDni']);
    const contact = String(policy.pages[0]?.data['contactName']);
    const loanRead = perfectCreditRead(loan);
    const credit = await evaluate(
      [packFor(creditBankOf)(loan)],
      creditBankOf,
      employmentDeps(
        new FixedReader(() => ({
          toolInput: {
            ...loanRead,
            credit_agreement: {
              ...(loanRead['credit_agreement'] as object),
              withdrawalClauseText: { value: `Titular ${dni}.`, confidence: 'high' },
            },
          },
          inputTokens: 20_000,
          outputTokens: 3000,
        })),
        100,
      ),
    );
    expect(credit.personsTranscribed).toBe(1);
    const policyRead = perfectInsuranceRead(policy);
    const insurance = await evaluate(
      [packFor(insuranceBankOf)(policy)],
      insuranceBankOf,
      deps(
        new FixedReader(() => ({
          toolInput: {
            ...policyRead,
            insurance_policy: {
              ...(policyRead['insurance_policy'] as object),
              nonRenewalClauseText: { value: `Gestor: ${contact}.`, confidence: 'high' },
            },
          },
          inputTokens: 15_000,
          outputTokens: 1500,
        })),
        100,
      ),
    );
    expect(insurance.personsTranscribed).toBe(1);
  });
});
