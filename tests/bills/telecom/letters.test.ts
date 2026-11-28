import { describe, expect, it } from 'vitest';
import { exitLetter, penaltyLetter, telecomLetterKinds } from '../../../src/bills/telecom/letters';
import type { CompletedTelecomReview } from '../../../src/bills/telecom/ports';
import { NO_DETAILS } from '../../../src/documents/letter';
import type { Block } from '../../../src/documents/ports';
import { BILLS_SOURCES } from '../../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import type { BillsCalculation } from '../../../src/engine/bills/calculation';
import {
  billFinding,
  single,
  type BillItem,
  type BillsItemId,
  type BillsStatus,
} from '../../../src/engine/bills/finding';
import { reviewTelecom, type TelecomReview } from '../../../src/engine/bills/telecom-review';
import type { TelecomInput } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import type { Translate } from '../../../src/i18n/client';
import { telecom, TODAY } from '../../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../../engine/bills/norms-before-figure';

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
const P = 'client.bills.telecom.letter.';

function reviewed(input: TelecomInput): TelecomReview {
  const r = reviewTelecom(input, TODAY, {
    norms: NORMS_BEFORE_FIGURE,
    sources: BILLS_SOURCES,
    tables: { holidays: BILLS_TABLES.holidays },
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.review;
}

function finding(
  id: BillsItemId,
  status: BillsStatus,
  { amount = 1, rule = 'vat', calculation = [] as BillsCalculation } = {},
) {
  return billFinding(id, status, calculation, [rule as 'vat'], NORMS_BEFORE_FIGURE, {
    amount,
    direction: 'over',
  });
}

const readingsOf = (id: BillsItemId, ...statuses: BillsStatus[]): BillItem => ({
  kind: 'readings',
  question: 'handset_share',
  readings: statuses.map((s, i) => ({
    when: i === 0 ? 'whole_value' : 'prorated_value',
    finding: finding(id, s, { rule: i === 0 ? 'vat' : 'billing' }),
  })),
});
const readings = (...statuses: BillsStatus[]) => readingsOf('change_exit', ...statuses);

function entry(
  items: BillItem[],
  change: Partial<TelecomInput> = {},
  inScope = true,
): CompletedTelecomReview {
  const input = telecom(change);
  const review = reviewed(input);
  return {
    input,
    review: { ...review, items, scope: inScope ? { inScope: true } : review.scope },
  } as CompletedTelecomReview;
}

const texts = (blocks: readonly Block[]) => blocks.map((b) => ('text' in b ? b.text : b.type));
const bodyOf = (blocks: readonly Block[]) => blocks.slice(5, -3);
const notice = (appliesOn: string | null) => ({
  sentOn: parseDate('2026-02-01'),
  appliesOn: appliesOn === null ? null : parseDate(appliesOn),
  change: 'price_up' as const,
  index: 'none' as const,
});

describe('which telecom letters an exit offers, by reading', () => {
  const kinds = (items: BillItem[], inScope = true) =>
    telecomLetterKinds(entry(items, {}, inScope)).free;

  it('offers none when a reading is to be looked at, or none is over', () => {
    expect(kinds([readings('paid_over', 'review_it')])).toEqual([]);
    expect(kinds([readings('within_limit', 'within_limit')])).toEqual([]);
    expect(kinds([single(finding('change_exit', 'within_limit'))])).toEqual([]);
  });

  it('looks for the line among items that carry no reading', () => {
    const empty: BillItem = { kind: 'readings', question: 'handset_share', readings: [] };
    expect(kinds([empty, single(finding('change_exit', 'paid_over'))])).toEqual([
      'telecom_exit_without_penalty',
    ]);
  });

  it('offers the penalty letter only for a single reading over its cap', () => {
    const penalty = (item: BillItem) => telecomLetterKinds(entry([item], {})).paid;
    expect(penalty(single(finding('commitment_penalty', 'paid_over')))).toEqual([
      'telecom_penalty_review',
    ]);
    expect(penalty(single(finding('commitment_penalty', 'paid_over', { amount: 0 })))).toEqual([]);
    expect(penalty(single(finding('commitment_penalty', 'within_limit')))).toEqual([]);
    expect(penalty(readingsOf('commitment_penalty', 'paid_over', 'paid_over'))).toEqual([]);
    expect(penalty({ kind: 'readings', question: 'handset_share', readings: [] })).toEqual([]);
  });

  it('offers none outside the review', () => {
    const out = telecomLetterKinds({
      input: telecom(),
      review: { ...reviewed(telecom()), scope: { inScope: false, reason: 'exit_before_2022' } },
    });
    expect(out).toEqual({ paid: [], free: [] });
  });
});

describe('the exit letter', () => {
  const change = (extra: Partial<TelecomInput> = {}) => ({
    changeNotice: notice('2026-03-10'),
    ...extra,
  });
  const letter = (e: CompletedTelecomReview) => exitLetter(e, NO_DETAILS, tr);
  const over = [single(finding('change_exit', 'paid_over'))];

  it('opens with the title and the details, and closes with the regards and the signature', () => {
    const model = letter(entry(over, change()));
    expect(model.title).toBe(`${P}exit.title`);
    expect(model.footer).toBeNull();
    expect(model.blocks.slice(0, 5)).toEqual([
      { type: 'title', text: `${P}exit.title` },
      expect.objectContaining({ label: 'client.documents.letter.name' }),
      expect.objectContaining({ label: 'client.documents.letter.id' }),
      expect.objectContaining({ label: `${P}operator` }),
      expect.objectContaining({ label: `${P}reference` }),
    ]);
    expect(model.blocks.slice(-3)).toEqual([
      { type: 'text', text: 'client.bills.letter.regards' },
      expect.objectContaining({ type: 'text' }),
      expect.objectContaining({ label: 'client.documents.letter.name' }),
    ]);
  });

  it('gives the dates, the rule, the source and the request', () => {
    const body = bodyOf(letter(entry(over, change())).blocks);
    expect(body.map((b) => b.type)).toEqual(['text', 'text', 'text', 'source', 'text']);
    expect(texts(body)).toEqual([
      `${P}exit.notice_applies {"aviso":"01-02-2026","aplica":"10-03-2026"}`,
      `${P}exit.request {"baja":"01-03-2026"}`,
      `${P}exit.rule`,
      expect.any(String),
      `${P}exit.ask`,
    ]);
  });

  it('says only when it was notified when the change has no day of its own', () => {
    const body = bodyOf(letter(entry(over, { changeNotice: notice(null) })).blocks);
    expect(texts(body)[0]).toBe(`${P}exit.notice {"aviso":"01-02-2026"}`);
  });

  it('cites each rule once, whatever the readings', () => {
    const body = bodyOf(letter(entry([readings('paid_over', 'within_limit')], change())).blocks);
    expect(body.filter((b) => b.type === 'source')).toHaveLength(2);
    const same = bodyOf(
      letter(
        entry(
          [
            {
              kind: 'readings',
              question: 'handset_share',
              readings: [
                { when: 'whole_value', finding: finding('change_exit', 'paid_over') },
                { when: 'prorated_value', finding: finding('change_exit', 'paid_over') },
              ],
            },
          ],
          change(),
        ),
      ).blocks,
    );
    expect(same.filter((b) => b.type === 'source')).toHaveLength(1);
  });

  it.each([
    [
      'a handset kept, worth nothing',
      { handset: { value: 0, kept: true } },
      `${P}exit.handset_returned`,
      `${P}exit.ask`,
    ],
  ])('words %s', (_title, extra, handset, ask) => {
    const list = texts(bodyOf(letter(entry(over, change(extra))).blocks));
    expect(list).toContain(handset);
    expect(list.at(-1)).toBe(ask);
    expect(list).toHaveLength(6);
  });

  it.each([
    ['no change notified', entry(over, { changeNotice: null })],
    ['no line to look at', entry([], change())],
  ])('writes no body with %s', (_title, e) => {
    expect(bodyOf(letter(e).blocks)).toEqual([]);
  });
});

describe('the penalty letter', () => {
  const phrase = (euros: unknown, key = 'commitment.proportional') =>
    [{ key, vars: { euros } }] as unknown as BillsCalculation;
  const penalty = (calculation: BillsCalculation = phrase({ euros: 60.33 })) => [
    single(finding('commitment_penalty', 'paid_over', { amount: 59.67, calculation })),
  ];
  const letter = (e: CompletedTelecomReview) => penaltyLetter(e, NO_DETAILS, tr);

  it('gives the days, the rule, the cap and the difference, the source and the request', () => {
    const body = bodyOf(letter(entry(penalty(), { penaltyCharged: 120 })).blocks);
    expect(body.map((b) => b.type)).toEqual(['text', 'text', 'text', 'source', 'text']);
    const list = texts(body);
    expect(list[0]).toMatch(new RegExp(`^${P}penalty\\.body \\{"meses".*"cobrada"`));
    expect(list[1]).toBe(`${P}penalty.rule`);
    expect(list[2]).toMatch(
      new RegExp(`^${P}penalty\\.over \\{"pendientes".*"maximo".*"diferencia"`),
    );
    expect(list[4]).toBe(`${P}penalty.ask`);
    expect(letter(entry(penalty())).title).toBe(`${P}penalty.title`);
  });

  it.each([
    ['no finding', [], {}],
    ['no commitment', penalty(), { commitment: null }],
    [
      'no agreed penalty',
      penalty(),
      { commitment: { startedOn: parseDate('2025-03-01'), months: 18, agreedPenalty: null } },
    ],
    ['no penalty charged', penalty(), { penaltyCharged: null }],
    ['another phrase', penalty(phrase({ euros: 5 }, 'commitment.other')), {}],
    ['a phrase with no figures', penalty([{ key: 'commitment.proportional' }]), {}],
  ] as const)('writes no body with %s', (_title, items, change) => {
    expect(bodyOf(letter(entry([...items], change)).blocks)).toEqual([]);
  });
});
