import { describe, expect, it } from 'vitest';
import { correctedBills, correctionLetter } from '../../../src/bills/electricity/letters';
import type { CompletedElectricityReview } from '../../../src/bills/electricity/ports';
import { entryWith, finding } from './support';
import { NO_DETAILS } from '../../../src/documents/letter';
import { single, type BillItem, type BillsItemId } from '../../../src/engine/bills/finding';
import type { ElectricityBillInput } from '../../../src/engine/bills/types';
import type { Translate } from '../../../src/i18n/client';
import { juneBill, meter } from '../../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../../engine/bills/norms-before-figure';

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

const billedOf = (
  id: BillsItemId,
  change: Partial<ElectricityBillInput>,
  line: number | null = null,
) => correctedBills([entryWith([single(finding(id, 1, line))], change)])[0]?.lines[0]?.billed;

describe('what a bill charged for a line over the norm', () => {
  const absent = {
    meter: null,
    socialBonus: null,
    electricityTax: null,
    vat: null,
    exitPenalty: null,
    excessPower: null,
  } satisfies Partial<ElectricityBillInput>;

  it.each([
    ['meter', { meter: meter({ amount: 1.1 }) }, 1.1],
    ['social_bonus_funding', { socialBonusFunding: 0.7 }, 0.7],
    [
      'social_bonus',
      {
        socialBonus: {
          amount: 4,
          category: null,
          members: null,
          discountedKwh: null,
          kwhSoFar: null,
        },
      },
      4,
    ],
    ['electricity_tax', { electricityTax: { base: null, percent: null, amount: 2.5 } }, 2.5],
    ['vat', { vat: { base: null, percent: null, amount: 10.6 } }, 10.6],
    [
      'exit_penalty',
      { exitPenalty: { amount: 30, priceType: null, firstRenewalPassed: null } },
      30,
    ],
    ['excess_power', { excessPower: { amount: 6, maximeter: null } }, 6],
    ['total', {}, null],
  ] as const)('is the amount of its own line for %s', (id, change, expected) => {
    expect(billedOf(id, { ...absent, ...change })).toBe(expected);
  });

  it.each([
    'meter',
    'social_bonus',
    'electricity_tax',
    'vat',
    'exit_penalty',
    'excess_power',
  ] as const)('is not known for %s when the answers do not say it', (id) => {
    expect(billedOf(id, absent)).toBeNull();
  });

  it('is the sum of the power lines of its period, null when it has none', () => {
    const power = [
      { period: 'p1', kw: 1, price: 1, unit: 'per_kw_year', days: null, amount: 2 },
      { period: 'p1', kw: 1, price: 1, unit: 'per_kw_year', days: null, amount: 3 },
      { period: 'p2', kw: 1, price: 1, unit: 'per_kw_year', days: null, amount: 7 },
    ] as const;
    expect(billedOf('pvpc_power_p1', { power })).toBe(5);
    expect(billedOf('pvpc_power_p2', { power })).toBe(7);
    expect(billedOf('pvpc_power_p1', { power: [power[2]] })).toBeNull();
    expect(billedOf('pvpc_power_p2', { power: [power[0]] })).toBeNull();
  });

  it('is the amount of the service the line is, null when it is of no service', () => {
    const services = [
      { label: 'maintenance', amount: 5, requested: 'no' },
      { label: 'insurance', amount: 3, requested: 'no' },
    ] as const;
    expect(billedOf('service', { services }, 1)).toBe(3);
    expect(billedOf('service', { services }, 2)).toBeNull();
    expect(billedOf('service', { services }, null)).toBeNull();
  });
});

describe('the lines of a bill over the norm', () => {
  const across = (...amounts: number[]): BillItem => ({
    kind: 'readings',
    question: 'official_value',
    readings: amounts.map((amount, i) => ({
      when: i === 0 ? 'lower_value' : 'higher_value',
      finding: finding('vat', amount),
    })),
  });

  it('takes the finding with the lowest figure, flagging that other readings give more', () => {
    const [bill] = correctedBills([entryWith([across(5, 3, 8)])]);
    expect(bill?.lines.map((l) => [l.finding.amount, l.lowest])).toEqual([[3, true]]);
    expect(correctedBills([entryWith([single(finding('vat', 3))])])[0]?.lines[0]?.lowest).toBe(
      false,
    );
  });

  it('carries no line a reading gives nothing for', () => {
    expect(correctedBills([entryWith([across(5, 0)])])).toEqual([]);
  });

  it('carries no bill outside the review', () => {
    const entry = entryWith([single(finding('vat', 3))]);
    const out = {
      ...entry,
      review: { ...entry.review, scope: { inScope: false, reason: 'over_15kw' } },
    } as CompletedElectricityReview;
    expect(correctedBills([out])).toEqual([]);
  });
});

describe('the correction letter, block by block', () => {
  const details = { ...NO_DETAILS, name: 'Alex', id: '1', company: 'Ret', reference: 'R' };
  const vat = (amount: number, change: Partial<ElectricityBillInput> = {}) =>
    entryWith([single(finding('vat', amount))], {
      vat: { base: null, percent: null, amount: 10 },
      ...change,
    });
  const july = { readingFrom: juneBill().readingTo, readingTo: juneBill().dueOn };

  it('words a line of a discount the bill gives as the norm giving less', () => {
    const entry = entryWith([single(finding('social_bonus', 1))], {
      socialBonus: {
        amount: 5,
        category: null,
        members: null,
        discountedKwh: null,
        kwhSoFar: null,
      },
    });
    const bullets = correctionLetter([entry], NORMS_BEFORE_FIGURE, details, tr).blocks.filter(
      (b) => b.type === 'bullet',
    );
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toMatchObject({
      text: expect.stringContaining('client.bills.letter.correction.line_discount'),
    });
    expect(bullets[0]).toMatchObject({ text: expect.stringMatching(/"norma":"6,00/) });
  });

  it('words a charge as the norm setting less, and a line not told apart by its difference', () => {
    const blocks = (entry: CompletedElectricityReview) =>
      correctionLetter([entry], NORMS_BEFORE_FIGURE, details, tr).blocks;
    expect(blocks(vat(1))).toContainEqual({
      type: 'bullet',
      text: expect.stringMatching(/^client\.bills\.letter\.correction\.line \{.*"norma":"9,00/),
    });
    const told = blocks(entryWith([single(finding('total', 1))]));
    expect(told).toContainEqual({
      type: 'bullet',
      text: expect.stringMatching(
        /^client\.bills\.letter\.correction\.line_difference \{"linea":".+","diferencia":".+"\}$/,
      ),
    });
  });

  it('gives the title and the intro of one bill, then of several', () => {
    const one = correctionLetter([vat(1)], NORMS_BEFORE_FIGURE, details, tr);
    expect(one.title).toBe('client.bills.letter.correction.title_one');
    expect(one.blocks[0]).toEqual({ type: 'title', text: one.title });
    expect(one.blocks).toContainEqual({
      type: 'text',
      text: 'client.bills.letter.correction.intro_one',
    });
    const two = correctionLetter([vat(1), vat(1, july)], NORMS_BEFORE_FIGURE, details, tr);
    expect(two.title).toBe('client.bills.letter.correction.title_many');
    expect(two.blocks).toContainEqual({
      type: 'text',
      text: 'client.bills.letter.correction.intro_many {"n":2}',
    });
    expect(two.blocks.filter((b) => b.type === 'subheading')).toHaveLength(2);
  });

  it('adds up the differences only when there are several lines, and says the lowest only when it is', () => {
    const kinds = (entries: CompletedElectricityReview[]) =>
      correctionLetter(entries, NORMS_BEFORE_FIGURE, details, tr).blocks.map((b) =>
        'text' in b ? b.text.split(' ')[0] : b.type,
      );
    const one = kinds([vat(1)]);
    expect(one).not.toContain('client.bills.letter.correction.total');
    expect(one).not.toContain('client.bills.letter.correction.lowest');
    const two = kinds([vat(1), vat(1, july)]);
    expect(two).toContain('client.bills.letter.correction.total');
    const readings = kinds([
      entryWith([
        {
          kind: 'readings',
          question: 'official_value',
          readings: [
            { when: 'lower_value', finding: finding('vat', 1) },
            { when: 'higher_value', finding: finding('vat', 2) },
          ],
        },
      ]),
    ]);
    expect(readings).toContain('client.bills.letter.correction.lowest');
  });

  it('lists each rule the lines rest on once, with its link', () => {
    const entries = [vat(1), vat(1, july)];
    const blocks = correctionLetter(entries, NORMS_BEFORE_FIGURE, details, tr).blocks;
    const sources = blocks.filter((b) => b.type === 'source');
    const cited = sources.map((b) => ('text' in b ? b.text : ''));
    expect(sources).toHaveLength(2);
    expect(new Set(cited).size).toBe(2);
    for (const s of sources) expect(s).toMatchObject({ url: expect.stringMatching(/^https:/) });
  });

  it('keeps the rules of every line, whichever they are', () => {
    const entry = entryWith([
      single(finding('vat', 1, null, 'vat')),
      single(finding('meter', 1, null, 'meter_rent')),
    ]);
    const sources = correctionLetter([entry], NORMS_BEFORE_FIGURE, details, tr).blocks.filter(
      (b) => b.type === 'source',
    );
    expect(sources).toHaveLength(3);
  });

  it('says the lowest reading counts when any line has several readings, not only all', () => {
    const readings: BillItem = {
      kind: 'readings',
      question: 'official_value',
      readings: [
        { when: 'lower_value', finding: finding('meter', 1) },
        { when: 'higher_value', finding: finding('meter', 2) },
      ],
    };
    const entry = entryWith([single(finding('vat', 1)), readings]);
    const kinds = correctionLetter([entry], NORMS_BEFORE_FIGURE, details, tr).blocks.map(
      (b) => b.type,
    );
    expect(kinds).toContain('note');
  });

  it('closes with the refund, the request, the regards and the signature', () => {
    const blocks = correctionLetter([vat(1)], NORMS_BEFORE_FIGURE, details, tr).blocks;
    const texts = blocks.filter((b) => b.type === 'text').map((b) => 'text' in b && b.text);
    expect(texts).toEqual([
      'client.bills.letter.correction.intro_one',
      'client.bills.letter.correction.refund',
      'client.bills.letter.correction.ask',
      'client.bills.letter.regards',
      expect.stringContaining('client.documents.letter.place_date'),
    ]);
  });
});
