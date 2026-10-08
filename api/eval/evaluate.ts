import type { DocumentFile } from '../src/domain/documents';
import {
  assess,
  extract,
  type Assessment,
  type ExtractMetrics,
  type ExtractResponse,
} from '../src/domain/extract';
import { parseReading } from '../src/domain/extraction';
import type {
  CaptchaVerifier,
  Clock,
  DocumentReader,
  ModelRead,
  PaymentVerifier,
  TokenSigner,
} from '../src/domain/ports';
import { costUsd, priceOf, SpendCounter, worstCaseUsd, type WorstCase } from './budget';
import {
  EMPLOYMENT_PERSON_KEYS,
  employmentPageKind,
  isEmploymentTemplatePage,
  type EmploymentBankCase,
  type EmploymentTemplateId,
} from './employment-schema';
import {
  isTemplatePage,
  pageKind,
  PERSON_KEYS,
  type BankCase,
  type ExpectedExtraction,
  type ExpectedValue,
  type PageData,
  type TemplateId,
} from './schema';

// What any bank's case gives the run: its pages' data and what a read should find.
export interface EvalCase {
  readonly id: string;
  readonly pages: readonly { readonly data: PageData }[];
  readonly expected: { readonly extraction: ExpectedExtraction };
}

export interface ExpectedPage {
  readonly kind: string;
  readonly readability: string;
}

// A bank of packs: the review its packs are read as, the image each page renders to, and the page
// data keys that hold a person's data.
export interface EvalBank<C extends EvalCase> {
  readonly review: 'rental' | 'employment';
  readonly pagesOf: (bankCase: C) => readonly ExpectedPage[];
  readonly personKeys: readonly string[];
}

export interface EvalPack<C extends EvalCase = BankCase> {
  readonly bankCase: C;
  // One image per sheet, in the order the case lists its pages.
  readonly files: readonly DocumentFile[];
}

export interface EvalDeps extends WorstCase {
  readonly reader: DocumentReader;
  readonly signer: TokenSigner;
  readonly clock: Clock;
  readonly maxUsd: number;
  // Reads so far that Bedrock cut at max_tokens; the reader port does not carry it.
  readonly truncatedReads: () => number;
  // Called before and after each pack, for progress on the console.
  readonly progress?: (line: string) => void;
}

interface Tally {
  expected: number;
  correct: number;
}

// One read of a pack that missed a field: the tool input exactly as the model wrote it (the bank is
// synthetic), what validation left out and what the domain made of the rest.
interface ReadDiagnosis {
  readonly model: string;
  readonly toolInput: unknown;
  readonly dropped: number;
  readonly unclassified: number;
  readonly sections: readonly string[];
  readonly doubtful: boolean;
  readonly failedChecks: Assessment['failed'];
  readonly extraction: Assessment['extraction'];
}

interface PackReport {
  readonly id: string;
  readonly code: string;
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly escalated: boolean;
  readonly conflicts: number;
  readonly maxTokens: number;
  readonly personsTranscribed: number;
  readonly fields: Tally;
  readonly pages: Tally;
  readonly reads?: readonly ReadDiagnosis[];
}

export interface EvalReport {
  readonly maxUsd: number;
  readonly worstCasePerPackUsd: number;
  readonly packs: number;
  readonly read: number;
  // The pack the run stopped before, when the next could have crossed the cap.
  readonly stoppedBefore: string | null;
  readonly costUsd: number;
  readonly accuracy: {
    readonly byField: Readonly<Record<string, Tally & { readonly accuracy: number }>>;
    readonly byPageKind: Readonly<
      Record<string, Tally & { readonly accuracy: number; readonly readabilityCorrect: number }>
    >;
  };
  readonly nothingRead: {
    readonly expected: number;
    readonly got: number;
    readonly agreed: number;
  };
  readonly conflicts: number;
  readonly escalations: number;
  readonly maxTokens: number;
  // Values of a person (names, DNI, IBAN) found in what the model wrote: must be 0.
  readonly personsTranscribed: number;
  readonly perPack: readonly PackReport[];
}

const ACCEPT_ALL: CaptchaVerifier = { verify: async () => true };
// Every read is a free one: the payment provider is never reached.
const NO_PAYMENTS: PaymentVerifier = {
  findSession: async () => {
    throw new Error('No payments in an evaluation run');
  },
  recordReads: async () => {
    throw new Error('No payments in an evaluation run');
  },
};

// What each image of a case should be read as; a template has as many images as sheets.
export function expectedPages(
  bankCase: BankCase,
  sheetsOf: (template: TemplateId) => number,
): readonly ExpectedPage[] {
  return bankCase.pages.flatMap((page) => {
    const count = isTemplatePage(page) ? sheetsOf(page.template) : 1;
    const entry = { kind: pageKind(page), readability: page.readability ?? 'ok' };
    return Array.from({ length: count }, () => entry);
  });
}

export function expectedEmploymentPages(
  bankCase: EmploymentBankCase,
  sheetsOf: (template: EmploymentTemplateId) => number,
): readonly ExpectedPage[] {
  return bankCase.pages.flatMap((page) => {
    const count = isEmploymentTemplatePage(page) ? sheetsOf(page.template) : 1;
    const entry = { kind: employmentPageKind(page), readability: page.readability ?? 'ok' };
    return Array.from({ length: count }, () => entry);
  });
}

export const rentalBank = (sheetsOf: (template: TemplateId) => number): EvalBank<BankCase> => ({
  review: 'rental',
  pagesOf: (c) => expectedPages(c, sheetsOf),
  personKeys: PERSON_KEYS,
});

export const employmentBank = (
  sheetsOf: (template: EmploymentTemplateId) => number,
): EvalBank<EmploymentBankCase> => ({
  review: 'employment',
  pagesOf: (c) => expectedEmploymentPages(c, sheetsOf),
  personKeys: EMPLOYMENT_PERSON_KEYS,
});

function diagnose(
  model: string,
  read: ModelRead,
  pageCount: number,
  review: EvalBank<EvalCase>['review'],
): ReadDiagnosis {
  const reading = parseReading(read.toolInput, pageCount, review);
  const { extraction, failed, doubtful } = assess(read, pageCount, review);
  return {
    model,
    toolInput: read.toolInput,
    dropped: reading.dropped,
    unclassified: reading.unclassified,
    sections: Object.keys(reading.sections),
    doubtful,
    failedChecks: failed,
    extraction,
  };
}

const same = (got: unknown, want: ExpectedValue): boolean =>
  typeof want === 'number' && typeof got === 'number' ? Math.abs(got - want) < 0.005 : got === want;

const normalise = (s: string): string => s.replace(/[\s-]/g, '').toLowerCase();

// Each person value the model wrote anywhere, however it spaced it.
function personsIn(
  reads: readonly ModelRead[],
  bankCase: EvalCase,
  keys: readonly string[],
): number {
  const values = new Set<string>();
  for (const page of bankCase.pages)
    for (const key of keys) {
      const v = page.data[key];
      if (typeof v === 'string') values.add(normalise(v));
    }
  const written = normalise(reads.map((r) => JSON.stringify(r.toolInput ?? null)).join('\n'));
  return [...values].filter((v) => written.includes(v)).length;
}

function tally<K extends string>(map: Map<K, Tally>, key: K, correct: boolean): void {
  const t = map.get(key) ?? { expected: 0, correct: 0 };
  t.expected += 1;
  if (correct) t.correct += 1;
  map.set(key, t);
}

const ratio = (t: Tally): number => (t.expected === 0 ? 0 : t.correct / t.expected);

// Both reviews' responses, read through the names they share.
type AnyResponse = ExtractResponse<'rental'> | ExtractResponse<'employment'>;
interface Scored {
  readonly fields: Readonly<Record<string, { readonly value: unknown } | undefined>>;
  readonly lists: Readonly<
    Record<string, readonly { readonly values: Readonly<Record<string, unknown>> }[] | undefined>
  >;
  readonly conflicts: readonly unknown[];
}

// Reads each pack through the same domain the Lambda runs, as its bank's review, and scores it.
// Before each pack it adds the measured cost so far to the worst case of the next one, and stops
// if that could cross the cap.
export async function evaluate<C extends EvalCase>(
  packs: readonly EvalPack<C>[],
  bank: EvalBank<C>,
  deps: EvalDeps,
): Promise<EvalReport> {
  const counter = new SpendCounter(deps.maxUsd);
  const worst = worstCaseUsd(deps);
  const byField = new Map<string, Tally>();
  const byKind = new Map<string, Tally>();
  const readable = new Map<string, number>();
  const perPack: PackReport[] = [];
  const nothingRead = { expected: 0, got: 0, agreed: 0 };
  let stoppedBefore: string | null = null;

  for (const { bankCase, files } of packs) {
    if (!counter.canAfford(worst)) {
      stoppedBefore = bankCase.id;
      deps.progress?.(
        `stop before ${bankCase.id}: ${counter.spentUsd.toFixed(4)} + ${worst.toFixed(4)} USD would pass ${deps.maxUsd}`,
      );
      break;
    }
    const reads: { model: string; read: ModelRead }[] = [];
    const reader: DocumentReader = {
      read: async (request) => {
        const read = await deps.reader.read(request);
        reads.push({ model: request.model, read });
        return read;
      },
    };
    const truncatedBefore = deps.truncatedReads();
    const metrics: ExtractMetrics = {};
    const response = (await extract(
      {
        files,
        captchaToken: 'eval',
        allowance: { type: 'free', token: null },
        review: bank.review,
      },
      {
        reader,
        captcha: ACCEPT_ALL,
        signer: deps.signer,
        payments: NO_PAYMENTS,
        clock: deps.clock,
        models: deps.models,
      },
      metrics,
    )) as AnyResponse;
    const cost = reads.reduce(
      (sum, r) =>
        sum + costUsd(priceOf(deps.prices, r.model), r.read.inputTokens, r.read.outputTokens),
      0,
    );
    counter.add(cost);

    const expected = bankCase.expected.extraction;
    if (expected.outcome === 'nothing_read') nothingRead.expected += 1;
    if (response.code === 'nothing_read') nothingRead.got += 1;
    if (expected.outcome === 'nothing_read' && response.code === 'nothing_read')
      nothingRead.agreed += 1;

    const pagesGot =
      response.code === 'ok'
        ? response.extraction.pages
        : response.code === 'nothing_read'
          ? response.pages
          : [];
    const pages: Tally = { expected: 0, correct: 0 };
    bank.pagesOf(bankCase).forEach((want, i) => {
      const got = pagesGot.find((p) => p.page === i + 1);
      const correct = got?.kind === want.kind;
      tally(byKind, want.kind, correct);
      if (got?.readability.value === want.readability)
        readable.set(want.kind, (readable.get(want.kind) ?? 0) + 1);
      pages.expected += 1;
      if (correct) pages.correct += 1;
    });

    const fields: Tally = { expected: 0, correct: 0 };
    const extraction: Scored | null = response.code === 'ok' ? response.extraction : null;
    const score = (name: string, got: unknown, want: ExpectedValue) => {
      const correct = same(got, want);
      tally(byField, name, correct);
      fields.expected += 1;
      if (correct) fields.correct += 1;
    };
    for (const [name, want] of Object.entries(expected.fields))
      score(name, extraction?.fields[name]?.value, want);
    for (const [list, rows] of Object.entries(expected.lists)) {
      const got = extraction?.lists[list] ?? [];
      rows.forEach((row, i) => {
        for (const [name, want] of Object.entries(row))
          score(`${list}.${name}`, got[i]?.values[name], want);
      });
    }

    const report: PackReport = {
      id: bankCase.id,
      code: response.code,
      costUsd: cost,
      inputTokens: metrics.inputTokens ?? 0,
      outputTokens: metrics.outputTokens ?? 0,
      escalated: metrics.escalated === true,
      conflicts: extraction?.conflicts.length ?? 0,
      maxTokens: deps.truncatedReads() - truncatedBefore,
      personsTranscribed: personsIn(
        reads.map((r) => r.read),
        bankCase,
        bank.personKeys,
      ),
      fields,
      pages,
      ...(fields.correct < fields.expected && {
        reads: reads.map(({ model, read }) => diagnose(model, read, files.length, bank.review)),
      }),
    };
    perPack.push(report);
    deps.progress?.(
      `${bankCase.id}: ${report.code}, ${fields.correct}/${fields.expected} fields, ${cost.toFixed(4)} USD (total ${counter.spentUsd.toFixed(4)})`,
    );
  }

  const sum = (pick: (p: PackReport) => number) => perPack.reduce((s, p) => s + pick(p), 0);
  return {
    maxUsd: deps.maxUsd,
    worstCasePerPackUsd: worst,
    packs: packs.length,
    read: perPack.length,
    stoppedBefore,
    costUsd: counter.spentUsd,
    accuracy: {
      byField: Object.fromEntries(
        [...byField].sort().map(([k, t]) => [k, { ...t, accuracy: ratio(t) }]),
      ),
      byPageKind: Object.fromEntries(
        [...byKind]
          .sort()
          .map(([k, t]) => [
            k,
            { ...t, accuracy: ratio(t), readabilityCorrect: readable.get(k) ?? 0 },
          ]),
      ),
    },
    nothingRead,
    conflicts: sum((p) => p.conflicts),
    escalations: sum((p) => (p.escalated ? 1 : 0)),
    maxTokens: sum((p) => p.maxTokens),
    personsTranscribed: sum((p) => p.personsTranscribed),
    perPack,
  };
}
