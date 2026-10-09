import { describe, expect, it } from 'vitest';
import { CREDIT_MERGE_RULES } from '../src/domain/credit-merge';
import { CREDIT_SECTIONS } from '../src/domain/credit-schema';
import {
  CREDIT_PERSON_KEYS,
  CREDIT_TEMPLATE_IDS,
  isCreditTemplatePage,
  type CreditBankCase,
} from '../eval/credit-schema';
import { FOOTER, SHEET } from '../eval/schema';
import { bankTemplate, CREDIT_BANK, expectFilled } from './support/bank';

const templatesOf = (c: CreditBankCase) =>
  c.pages.filter(isCreditTemplatePage).map((p) => p.template);

describe('the bank of credit packs', () => {
  it('names each case after its file and gives it a rule to exercise', () => {
    const ids = CREDIT_BANK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CREDIT_BANK) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.description, c.id).toMatch(/\bLCC\b|Ley|STS|art\./);
    }
  });

  it('holds 24 packs and marks ten hard ones for the AI pass, the unreadable ones among them', () => {
    expect(CREDIT_BANK).toHaveLength(24);
    expect(CREDIT_BANK.filter((c) => c.eval)).toHaveLength(10);
    for (const c of CREDIT_BANK.filter((x) => x.expected.extraction.outcome === 'nothing_read'))
      expect(c.eval, c.id).toBe(true);
  });

  it('gives every template placeholder a value, row by row in repeated blocks', () => {
    for (const c of CREDIT_BANK)
      for (const page of c.pages.filter(isCreditTemplatePage))
        expectFilled(c.id, bankTemplate(page.template), page.data);
  });

  it('expects only fields the credit response carries and lists the credit schema has', () => {
    const fields = new Set(Object.keys(CREDIT_MERGE_RULES));
    const lists = Object.fromEntries(
      Object.values(CREDIT_SECTIONS).flatMap((s) =>
        Object.entries(s.lists).map(([name, spec]) => [name, new Set(Object.keys(spec.item))]),
      ),
    );
    for (const c of CREDIT_BANK) {
      for (const name of Object.keys(c.expected.extraction.fields))
        expect(fields, `${c.id}: ${name}`).toContain(name);
      for (const [name, rows] of Object.entries(c.expected.extraction.lists))
        for (const row of rows)
          for (const key of Object.keys(row))
            expect(lists[name], `${c.id}: ${name}.${key}`).toContain(key);
    }
  });

  it('covers the spread the review needs', () => {
    const inputs = CREDIT_BANK.map((c) => c.expected.input);
    const count = (pick: (i: (typeof inputs)[number]) => boolean) => inputs.filter(pick).length;
    expect(count((i) => i.product === 'personal_loan')).toBeGreaterThanOrEqual(4);
    expect(count((i) => i.product === 'car_loan')).toBeGreaterThanOrEqual(4);
    expect(
      count((i) => i.balloon !== null && i.insurance?.single === true && i.insurance.financed),
    ).toBeGreaterThanOrEqual(1);
    expect(count((i) => i.balloon !== null && i.balloon.dueOn === null)).toBeGreaterThanOrEqual(1);
    expect(count((i) => i.instalments?.kind === 'schedule')).toBeGreaterThanOrEqual(1);
    const revolvingWithStatements = CREDIT_BANK.filter((c) =>
      templatesOf(c).includes('credit/card-statement-es'),
    );
    expect(revolvingWithStatements.length).toBeGreaterThanOrEqual(4);
    const repayments = inputs.flatMap((i) => (i.earlyRepayment === null ? [] : [i]));
    expect(repayments.some((i) => i.rateType === 'variable')).toBe(true);
    expect(repayments.some((i) => i.earlyRepayment?.paidByInsurance)).toBe(true);
    expect(repayments.some((i) => i.earlyRepayment?.discountLost)).toBe(true);
    expect(repayments.some((i) => i.earlyRepayment?.remainingInterest !== null)).toBe(true);

    const reviews = CREDIT_BANK.map((c) => c.expected.review);
    expect(reviews.map((r) => r.scope)).toEqual(
      expect.arrayContaining([
        { inScope: false, reason: 'mortgage' },
        { inScope: false, reason: 'business' },
        { inScope: false, reason: 'before_lcc' },
        { inScope: true, indicatorOnly: true },
      ]),
    );
    const statuses = new Set(
      reviews.flatMap((r) =>
        r.items.flatMap((i) =>
          'readings' in i ? i.readings.map((x) => `${x.id}:${x.status}`) : [`${i.id}:${i.status}`],
        ),
      ),
    );
    for (const s of [
      'apr:matches',
      'apr:contract_lower',
      'apr:contract_missing',
      'early_repayment:above_general_cap',
      'early_repayment:charged_without_basis',
      'early_repayment:nothing_charged',
      'dealer_discount:review_it',
      'withdrawal:open',
      'withdrawal:ended',
    ])
      expect(statuses).toContain(s);
    const indicators = new Set(reviews.map((r) => r.indicator?.status));
    for (const s of ['above', 'edge', 'distance_only', 'not_published'])
      expect(indicators).toContain(s);

    expect(
      CREDIT_BANK.flatMap(templatesOf).filter((t) => !t.endsWith('-es')).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      CREDIT_BANK.filter((c) => c.pages.some((p) => !isCreditTemplatePage(p))).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      CREDIT_BANK.filter((c) => c.expected.extraction.outcome === 'nothing_read').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(CREDIT_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))));
    for (const key of CREDIT_PERSON_KEYS) expect(keys).toContain(key);
  });
});

describe('the credit templates', () => {
  it.each(CREDIT_TEMPLATE_IDS)(
    '%s says where it comes from and carries the footer on every sheet',
    (id) => {
      const html = bankTemplate(id);
      expect(html).toMatch(/^<!--[\s\S]*Source:[\s\S]*Licence:[\s\S]*-->/);
      const sheets = html.match(SHEET)?.length ?? 0;
      expect(sheets).toBeGreaterThanOrEqual(1);
      expect(html.split(FOOTER).length - 1).toBe(sheets);
    },
  );

  it('every template is used by some case', () => {
    const used = new Set(CREDIT_BANK.flatMap(templatesOf));
    for (const id of CREDIT_TEMPLATE_IDS) expect(used).toContain(id);
  });
});
