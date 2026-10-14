import { describe, expect, it } from 'vitest';
import {
  BILLS_TRACKABLE_FIELDS,
  HELP_TOPICS,
  SECTIONS,
  isValidEvent,
  type Track,
} from '../../src/analytics/events';
import {
  basketProps,
  electricityAnalytics,
  electricityBillProps,
  telecomAnalytics,
  telecomReviewProps,
} from '../../src/analytics/bills';
import {
  SHEET_FIELDS as ELECTRICITY_SHEET_FIELDS,
  SHEETS as ELECTRICITY_SHEETS,
} from '../../src/bills/electricity/form';
import { STEPS as ELECTRICITY_STEPS } from '../../src/bills/electricity/steps';
import {
  SHEET_FIELDS as TELECOM_SHEET_FIELDS,
  SHEETS as TELECOM_SHEETS,
} from '../../src/bills/telecom/form';
import { STEPS as TELECOM_STEPS } from '../../src/bills/telecom/steps';
import { BILLS_FAQ_TOPICS } from '../../src/content/bills-faq-topics';
import { reviewBasket } from '../../src/engine/bills/basket';
import { BILLS_SOURCES } from '../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../src/engine/bills/data/tables';
import { reviewElectricityBill } from '../../src/engine/bills/electricity-review';
import { reviewTelecom } from '../../src/engine/bills/telecom-review';
import type { ElectricityBillInput, TelecomInput } from '../../src/engine/bills/types';
import { parseDate } from '../../src/engine/date';
import { TODAY, freeBill, juneBill, meter, telecom } from '../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../engine/bills/norms-before-figure';

const electricity = (input: ElectricityBillInput) => {
  const r = reviewElectricityBill(input, TODAY, {
    norms: NORMS_BEFORE_FIGURE,
    tables: BILLS_TABLES,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { review: r.review, input };
};

const telecomReview = (input: TelecomInput) => {
  const r = reviewTelecom(input, TODAY, {
    norms: NORMS_BEFORE_FIGURE,
    sources: BILLS_SOURCES,
    tables: { holidays: BILLS_TABLES.holidays },
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { review: r.review, input };
};

// The June bill with the meter at 1,00 against its 0,80: 0,20 over, the same every month. VAT on
// (47,02 + 2,40 + 1,00) × 21 % = 10,5882 → 10,59; total 61,01.
const meterOver = (from = '2026-05-31', to = '2026-06-30') =>
  electricity(
    juneBill({
      readingFrom: parseDate(from),
      readingTo: parseDate(to),
      meter: meter({ amount: 1 }),
      vat: { base: 50.42, percent: 21, amount: 10.59 },
      total: 61.01,
    }),
  );

// What a bill can carry that must never leave: its supply code, the fingerprint the API gives
// back for it, a figure, a day.
const CUPS = 'ES0021000000000000AA0F';
const FINGERPRINT = '3f9a1c0e7b2d4a68';
const LEAKS = [CUPS, FINGERPRINT, 0.2, 61.01, '61,01', '2026-06-30', '30-06-2026', [CUPS]];

describe('the catalogue follows the bills forms', () => {
  it('every sheet of both reviews, and the result, is a trackable section, each once', () => {
    for (const step of [...ELECTRICITY_STEPS, ...TELECOM_STEPS]) expect(SECTIONS).toContain(step);
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
  });
  it('every question is a trackable field but the social bonus details', () => {
    const bonusOnly = ['bonusCategory', 'bonusAmount', 'bonusKwhSoFar', 'bonusDiscountedKwh'];
    for (const sheet of ELECTRICITY_SHEETS)
      for (const field of ELECTRICITY_SHEET_FIELDS[sheet])
        if (bonusOnly.includes(field)) expect(BILLS_TRACKABLE_FIELDS).not.toContain(field);
        else expect(BILLS_TRACKABLE_FIELDS).toContain(field);
    for (const sheet of TELECOM_SHEETS)
      for (const field of TELECOM_SHEET_FIELDS[sheet])
        expect(BILLS_TRACKABLE_FIELDS).toContain(field);
  });
  it('every question on the pages is a help topic', () => {
    for (const [, anchor] of BILLS_FAQ_TOPICS) expect(HELP_TOPICS).toContain(anchor);
    expect(new Set(HELP_TOPICS).size).toBe(HELP_TOPICS.length);
  });
});

describe('bills events', () => {
  it('accept the sheets, the fields, the reasons and the questions', () => {
    expect(isValidEvent('section_viewed', { section: 'bono-social-consumo' })).toBe(true);
    expect(isValidEvent('section_viewed', { section: 'despues' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'iva', to: 'contador' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'contador', field: 'meterAmount' })).toBe(
      true,
    );
    expect(isValidEvent('validation_error', { section: 'baja', field: 'exitRequestedOn' })).toBe(
      true,
    );
    expect(isValidEvent('validation_error', { section: 'suministro', field: 'cups' })).toBe(false);
    expect(isValidEvent('validation_error', { section: 'suministro', field: CUPS })).toBe(false);
    expect(isValidEvent('bills_out_of_scope', { reason: 'canary_ceuta_melilla' })).toBe(true);
    expect(isValidEvent('bills_out_of_scope', { reason: 'exit_before_2022' })).toBe(true);
    expect(isValidEvent('bills_out_of_scope', { reason: 'before_2019' })).toBe(false);
    expect(isValidEvent('help_opened', { topic: 'faq-luz-iva' })).toBe(true);
    expect(isValidEvent('help_opened', { topic: 'faq-permanencia-irte' })).toBe(true);
  });

  it('a bill that matches leaves its market and no finding', () => {
    const p = electricityBillProps(electricity(juneBill()));
    expect(isValidEvent('electricity_bill_reviewed', p)).toBe(true);
    expect(p).toEqual({
      market: 'pvpc',
      retailer: 'reference',
      findings: [],
      undercharged: false,
      conditional: false,
      recurring: false,
    });
  });

  it('names the kinds of line that do not match, and a recurring one', () => {
    const p = electricityBillProps(meterOver());
    expect(p.findings).toEqual(['meter']);
    expect(p.recurring).toBe(true);
    expect(p.undercharged).toBe(false);
  });

  it('says when something is charged short, without the figure', () => {
    // The meter at 1,00 with VAT left at 10,55: 0,04 short of (47,02 + 2,40 + 1,00) × 21 %.
    const p = electricityBillProps(electricity(juneBill({ meter: meter({ amount: 1 }) })));
    expect(p.undercharged).toBe(true);
    expect(p.findings).toEqual(expect.arrayContaining(['meter', 'vat', 'total']));
  });

  it('says when a result waits on November’s condition', () => {
    const p = electricityBillProps(electricity(juneBill({ dueOn: parseDate('2026-11-10') })));
    expect(p.conditional).toBe(true);
    expect(p.findings).toEqual(['electricity_tax', 'vat']);
  });

  it('a free-market bill carries its market and retailer as codes', () => {
    expect(electricityBillProps(electricity(freeBill()))).toMatchObject({
      market: 'free',
      retailer: 'other',
    });
  });

  it('a telecom exit leaves each point by its status', () => {
    const over = telecomReviewProps(telecomReview(telecom({ penaltyCharged: 90 })));
    expect(isValidEvent('telecom_review_completed', over)).toBe(true);
    expect(over).toEqual({ commitment: 'paid_over', change_exit: 'none', after_exit: 'none' });
    const none = telecomReviewProps(
      telecomReview(telecom({ commitment: null, penaltyCharged: null, lines: [] })),
    );
    expect(none).toEqual({ commitment: 'none', change_exit: 'none', after_exit: 'none' });
  });

  it('a year leaves its size, its difference and the offer in buckets', () => {
    const basket = reviewBasket([meterOver(), meterOver('2026-06-30', '2026-07-31')], {
      passPrice: 4.99,
    });
    const p = basketProps({ basket, attempt: 1, seconds: 400, detail: 'locked' });
    expect(isValidEvent('basket_completed', p)).toBe(true);
    expect(p).toEqual({
      size: '2-3',
      difference: '<100',
      offered: true,
      detail: 'locked',
      attempt: '1',
      seconds: '180-600',
    });
  });

  it('refuse a supply code, its fingerprint, a number or a date in any key', () => {
    const cases = [
      ['electricity_bill_reviewed', electricityBillProps(meterOver())],
      ['telecom_review_completed', telecomReviewProps(telecomReview(telecom()))],
      [
        'basket_completed',
        basketProps({
          basket: reviewBasket([meterOver()], { passPrice: 4.99 }),
          attempt: 1,
          seconds: 30,
          detail: 'unlocked',
        }),
      ],
      ['bills_out_of_scope', { reason: 'over_15kw' }],
    ] as const;
    for (const [name, props] of cases) {
      expect(isValidEvent(name, props), name).toBe(true);
      for (const key of Object.keys(props))
        for (const value of LEAKS)
          expect(isValidEvent(name, { ...props, [key]: value }), `${name}.${key}`).toBe(false);
      expect(isValidEvent(name, { ...props, cups: CUPS }), name).toBe(false);
      expect(isValidEvent(name, { ...props, supply: FINGERPRINT }), name).toBe(false);
    }
    expect(
      isValidEvent('electricity_bill_reviewed', {
        ...electricityBillProps(meterOver()),
        findings: ['meter', FINGERPRINT],
      }),
    ).toBe(false);
  });

  it('never tells that a household has the social bonus', () => {
    const sent: string[] = [];
    const events = electricityAnalytics(
      ((name: string, p: Record<string, unknown>) =>
        void sent.push(JSON.stringify([name, p]))) as Track,
      () => 0,
      () => 'locked',
    );
    events.stepShown('bono-social');
    events.fieldRejected('bono-social', 'bonusCategory');
    events.stepCompleted('bono-social');
    events.stepShown('bono-social-consumo');
    events.fieldRejected('bono-social-consumo', 'bonusKwhSoFar');
    events.stepCompleted('bono-social-consumo');
    events.wentBack('bono-social-consumo', 'bono-social');
    expect(sent.join()).not.toMatch(/bono-social-consumo|bonus(Category|Amount|KwhSoFar)/);
    expect(sent).toHaveLength(2);
  });

  it('electricityAnalytics names each event as the catalogue does and counts each year', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let clock = 0;
    let detail: 'locked' | 'unlocked' = 'locked';
    const events = electricityAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push([name, p]);
      }) as Track,
      () => clock,
      () => detail,
    );
    events.stepShown('suministro');
    clock = 12_000;
    events.fieldRejected('suministro', 'postcode');
    events.stepCompleted('suministro');
    events.outOfScope('canary_ceuta_melilla');
    events.helpOpened('faq-luz-contador');
    const bill = meterOver();
    events.reviewCompleted(bill);
    clock = 100_000;
    events.basketCompleted(reviewBasket([bill], { passPrice: 4.99 }));
    detail = 'unlocked';
    events.basketCompleted(
      reviewBasket([bill, meterOver('2026-06-30', '2026-07-31')], {
        passPrice: 4.99,
      }),
    );
    events.startedOver();
    expect(sent.map(([n]) => n)).toEqual([
      'section_viewed',
      'validation_error',
      'section_completed',
      'bills_out_of_scope',
      'help_opened',
      'electricity_bill_reviewed',
      'basket_completed',
      'basket_completed',
      'started_over',
    ]);
    expect(sent[3]?.[1]).toEqual({ reason: 'canary_ceuta_melilla' });
    expect(sent[6]?.[1]).toEqual({
      size: '1',
      difference: '<100',
      offered: false,
      detail: 'locked',
      attempt: '1',
      seconds: '60-180',
    });
    expect(sent[7]?.[1]).toMatchObject({
      size: '2-3',
      offered: true,
      detail: 'unlocked',
      attempt: '2',
    });
  });

  it('telecomAnalytics names each event as the catalogue does', () => {
    const sent: string[] = [];
    const events = telecomAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push(name);
      }) as Track,
      () => 0,
    );
    events.stepShown('permanencia');
    events.outOfScope('exit_before_2022');
    events.reviewCompleted(telecomReview(telecom()));
    expect(sent).toEqual(['section_viewed', 'bills_out_of_scope', 'telecom_review_completed']);
  });
});
