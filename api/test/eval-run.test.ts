import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { MODEL_PRICES_USD_PER_MTOK, SONNET_4_6, SONNET_5_5 } from '../src/config';
import type { DocumentReader, ModelRead } from '../src/domain/ports';
import { MAX_ESTIMATED_INPUT_TOKENS } from '../src/domain/tokens';
import { SpendCounter, worstCaseUsd } from '../eval/budget';
import { parseEvalEnv, selectCases } from '../eval/env';
import { evaluate, expectedPages, type EvalDeps, type EvalPack } from '../eval/evaluate';
import type { BankCase } from '../eval/schema';
import { BANK, sheetsOf } from './support/bank';
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
    const report = await evaluate(packs, sheetsOf, deps(reader, 1));
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
    const report = await evaluate(packs, sheetsOf, deps(reader, 1));
    expect(report.read).toBe(2);
    expect(report.costUsd).toBeLessThanOrEqual(1);
  });

  it('reads nothing when the cap cannot hold one pack', async () => {
    const reader = new FixedReader(() => ({ toolInput: null, inputTokens: 1, outputTokens: 1 }));
    const report = await evaluate(packs, sheetsOf, deps(reader, 0.39));
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
    const report = await evaluate(cases.map(packOf), sheetsOf, deps(reader, 100));
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
    const report = await evaluate([packOf(c)], sheetsOf, deps(reader, 100));
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
    const report = await evaluate(unreadable.map(packOf), sheetsOf, deps(reader, 100));
    expect(report.nothingRead).toEqual({
      expected: unreadable.length,
      got: unreadable.length,
      agreed: unreadable.length,
    });
  });
});
