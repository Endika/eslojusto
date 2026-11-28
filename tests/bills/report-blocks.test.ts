import { describe, expect, it } from 'vitest';
import { billsReport, type ReportedReview } from '../../src/bills/report';
import type { Block } from '../../src/documents/ports';
import { billsPhrase } from '../../src/engine/bills/calculation';
import {
  billFinding,
  single,
  type BillFinding,
  type BillItem,
  type BillTotals,
} from '../../src/engine/bills/finding';
import type { BillsNormId } from '../../src/engine/bills/norms';
import type { RowCitation } from '../../src/engine/bills/period';
import type { Translate } from '../../src/i18n/client';
import { NORMS_BEFORE_FIGURE } from '../engine/bills/norms-before-figure';

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
const TODAY = { y: 2026, m: 10, d: 13 };
const NORMS = NORMS_BEFORE_FIGURE;
const [NORM_A, NORM_B] = Object.keys(NORMS) as [BillsNormId, BillsNormId];

const totals = (counted: number, upTo = counted, under = 0): BillTotals => ({
  counted,
  upTo,
  under,
});

const cited = (norm: BillsNormId, from: string): RowCitation => ({
  from,
  until: null,
  norm,
  url: `https://rows.example/${norm}/${from}`,
  status: 'in_force',
  doubt: null,
});

const found = (rules: ('vat' | 'billing')[], rows: RowCitation[] = []): BillFinding => ({
  ...billFinding('vat', 'paid_over', [billsPhrase('scope.over_15kw')], rules, NORMS, {
    amount: 1,
    direction: 'over',
  }),
  rows,
});

const readingsOf = (a: BillFinding, b: BillFinding): BillItem => ({
  kind: 'readings',
  question: 'official_value',
  readings: [
    { when: 'lower_value', finding: a },
    { when: 'higher_value', finding: b },
  ],
});

const review = (change: Partial<ReportedReview> = {}): ReportedReview => ({
  heading: 'HEAD',
  items: [],
  totals: totals(0),
  labels: { title: (f) => `T:${f.id}` },
  ...change,
});

const blocks = (
  reviews: ReportedReview[],
  {
    year = null,
    extra,
  }: { year?: Parameters<typeof billsReport>[0]['year']; extra?: Block[] } = {},
) =>
  billsReport(
    {
      title: 'client.bills.electricity.report.title',
      intro: 'client.bills.electricity.report.intro',
      reviews,
      year,
      norms: NORMS,
      ...(extra && { extra }),
    },
    tr,
    TODAY,
  );

const types = (list: readonly Block[]) => list.map((b) => b.type);

describe('the blocks of a report', () => {
  it('opens with the title, when it was made and the intro, and closes with what the section adds', () => {
    const model = blocks([], { extra: [{ type: 'note', text: 'EXTRA' }] });
    expect(model.title).toBe('client.bills.electricity.report.title');
    expect(model.footer).toMatch(/^client\.bills\.report\.footer \{"fecha":".+"\}$/);
    expect(model.blocks).toEqual([
      { type: 'title', text: 'client.bills.electricity.report.title' },
      {
        type: 'meta',
        text: expect.stringMatching(/^client\.bills\.report\.generated \{"fecha":".+"\}$/),
      },
      { type: 'rule' },
      { type: 'text', text: 'client.bills.electricity.report.intro' },
      { type: 'heading', text: 'client.bills.report.reviews' },
      { type: 'note', text: 'EXTRA' },
    ]);
  });

  it('adds the year after the intro, with its estimate only when there is one', () => {
    const year = (yearlyEstimate: number | null) => ({
      totals: totals(5),
      recurring: ['a', 'b'],
      yearlyEstimate,
    });
    const withEstimate = blocks([], { year: year(120) }).blocks.slice(4, -1);
    expect(withEstimate).toEqual([
      { type: 'heading', text: 'client.bills.report.year' },
      { type: 'row', label: 'client.bills.report.counted', value: expect.stringMatching(/^5,00/) },
      {
        type: 'note',
        text: expect.stringMatching(
          /^client\.bills\.basket\.estimate \{"partidas":"a, b","importe":"120/,
        ),
      },
    ]);
    expect(types(blocks([], { year: year(null) }).blocks.slice(4, -1))).toEqual(['heading', 'row']);
  });

  it('says a bill listed as a copy only as that, without its lines or totals', () => {
    const model = blocks([
      review({ skipped: 'COPY', items: [single(found(['vat']))], totals: totals(3) }),
    ]);
    expect(model.blocks.slice(5)).toEqual([
      { type: 'subheading', text: 'HEAD' },
      { type: 'note', text: 'COPY' },
    ]);
  });

  it('adds what is over in some reading, and what is charged short, only when there is some', () => {
    const notes = (t: BillTotals) =>
      blocks([review({ totals: t })])
        .blocks.slice(6)
        .map((b) => ('text' in b ? b.text : b.type));
    expect(notes(totals(1))).toEqual(['row']);
    expect(notes(totals(1, 2))).toEqual([
      'row',
      expect.stringContaining('client.bills.total.up_to {'),
    ]);
    expect(notes(totals(1, 1, 0.5))).toEqual([
      'row',
      expect.stringContaining('client.bills.total.under {'),
    ]);
    expect(notes(totals(1, 2, 0.5))).toHaveLength(3);
  });

  it('gives every reading of a line the norms leave open, and each rule and row once', () => {
    const a = found(['vat'], [cited(NORM_A, '2026-01-01'), cited(NORM_A, '2026-02-01')]);
    const b = found(['vat', 'billing'], [cited(NORM_A, '2026-01-01'), cited(NORM_B, '2026-01-01')]);
    const list = blocks([review({ items: [readingsOf(a, b)] })]).blocks.slice(6, -1);
    expect(types(list)).toEqual([
      'row',
      'note',
      'text',
      'bullet',
      'text',
      'bullet',
      'source',
      'source',
      'source',
      'source',
      'source',
    ]);
    expect(list[2]).toMatchObject({
      text: expect.stringMatching(/^.+: client\.bills\.status\.paid_over/),
    });
    expect(list.filter((x) => x.type === 'source').at(-1)).toMatchObject({
      text: expect.stringMatching(/^client\.bills\.report\.row \{"norma":".+","estado":".+"\}$/),
    });
    expect(list[0]).toMatchObject({ value: 'client.bills.status.depends' });
    expect(list[1]).toEqual({ type: 'note', text: 'client.bills.depends.official_value' });
    expect(list.filter((x) => x.type === 'source').map((x) => ('url' in x ? x.url : ''))).toEqual([
      expect.stringMatching(/^https:/),
      expect.stringMatching(/^https:/),
      `https://rows.example/${NORM_A}/2026-01-01`,
      `https://rows.example/${NORM_A}/2026-02-01`,
      `https://rows.example/${NORM_B}/2026-01-01`,
    ]);
  });

  it('lists nothing for a line with no reading', () => {
    const empty: BillItem = { kind: 'readings', question: 'official_value', readings: [] };
    expect(blocks([review({ items: [empty] })]).blocks.slice(5)).toEqual([
      { type: 'subheading', text: 'HEAD' },
      { type: 'row', label: 'client.bills.report.counted', value: expect.any(String) },
    ]);
  });
});
