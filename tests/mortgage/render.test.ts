// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formatWholeEuros } from '../../src/calculator/number';
import { parseDate } from '../../src/engine/date';
import { reviewMortgage, type MortgageReview } from '../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput } from '../../src/engine/mortgage/types';
import type { Translate } from '../../src/i18n/client';
import { renderMortgageResult } from '../../src/mortgage/render';
import { DEPS, invoice, mortgage, TODAY } from '../engine/mortgage/input';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('mortgage');
const d = parseDate;

const review = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS): MortgageReview => {
  const r = reviewMortgage(mortgage(change), TODAY, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.review;
};

// The result's hooks and templates, as MortgageResult.astro has them.
function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
    </section>
    <section data-in-scope data-totals>
      <section data-total="statute">
        <p data-total-amount></p><p data-total-free hidden></p>
      </section>
      <section data-total="case_law">
        <p data-total-amount></p><p data-total-interest hidden></p>
        <p data-total-explained hidden></p>
      </section>
      <section data-total="fees" hidden>
        <p data-total-amount></p><p data-total-more hidden></p>
      </section>
    </section>
    <section data-in-scope><ul data-expenses-note></ul><div data-expenses></div></section>
    <section data-in-scope><div data-fees></div></section>
    <section data-in-scope><div data-flags></div></section>
    <section data-in-scope><div data-information></div></section>
    <section data-in-scope><ul data-unchecked></ul></section>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span><h4 data-title></h4>
        <p><svg data-mark><use href="#x"></use></svg><span data-status-text></span></p>
        <p data-depends hidden></p>
        <h5 data-how></h5><ol data-calculation></ol><div data-readings></div>
        <h5 data-rules-title></h5><ul data-rules></ul>
      </section>
    </template>
    <template data-template="reading">
      <div><h5 data-reading-title></h5><p data-reading-status></p><ol data-calculation></ol></div>
    </template>
    <template data-template="rule"><li><a></a><span data-rule-status></span></li></template>
    <template data-template="information">
      <details><summary data-info-title></summary><p data-info-text></p><ul data-info-links></ul></details>
    </template>`;
  return root;
}

const rendered = (r: MortgageReview, locked: boolean): HTMLElement => {
  const root = result();
  renderMortgageResult(root, r, locked, tr);
  return root;
};

// Text as read, with any run of spaces, the non-breaking ones among them, as one.
const plain = (s: string) => s.replace(/\s+/g, ' ').trim();
const text = (root: ParentNode, selector: string) =>
  plain(root.querySelector(selector)?.textContent ?? '');
const about = (euros: number) => plain(`unos ${formatWholeEuros(euros)}`);

const paid = (on: string) => ({ paidOn: d(on) });

// A December 2018 deed: the tax by law, the rest by the Supreme Court's split.
const deed2018 = (): Partial<MortgageInput> => ({
  deedOn: d('2018-12-12'),
  invoices: [
    invoice('notary_loan', 600, paid('2018-12-12')),
    invoice('registry_mortgage', 400, paid('2018-12-20')),
    invoice('ajd_loan', 1_100, paid('2018-12-12')),
  ],
});

describe('the mortgage result', () => {
  it('gives what the law says and what the split gives on lines that are never added', () => {
    const r = review(deed2018(), DEPS);
    const root = rendered(r, false);
    const statute = r.totals.statute.principal;
    const caseLaw = r.totals.caseLaw.principal;
    expect([statute, caseLaw]).toEqual([1_100, 700]);
    expect(text(root, '[data-total="statute"] [data-total-amount]')).toBe(about(statute));
    expect(text(root, '[data-total="case_law"] [data-total-amount]')).toBe(about(caseLaw));
    const page = root.textContent ?? '';
    expect(plain(page)).not.toContain(plain(formatWholeEuros(statute + caseLaw)));
    expect(page).not.toContain('1.800,00');
    expect(text(root, '[data-total-interest]')).toMatch(/^Interés legal hasta el 08-10-2026: unos/);
  });

  it('titles the two counts of the ten years of art. 23.7 for a mixed rate read as fixed', () => {
    const repaid = {
      on: d('2029-07-01'),
      kind: 'full_prepayment' as const,
      principal: 100_000,
      feeCharged: 1_800,
      hadInsurance: null,
    };
    const input = mortgage({
      deedOn: d('2019-07-01'),
      rateType: 'mixed',
      prepaymentOption: 'a_015_5y',
      operations: [repaid],
    });
    // Ten years after the deed, so a day still to come today.
    const r = reviewMortgage(input, d('2029-07-02'), DEPS);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const root = rendered(r.review, false);
    const fee = root.querySelector('[data-item="full_prepayment"]');
    expect(
      [...(fee?.querySelectorAll('[data-reading-title]') ?? [])].map((h) => h.textContent),
    ).toEqual([
      'Si se lee como fijo · Con los 10 años contados desde la escritura',
      'Si se lee como fijo · Con los 10 años contados desde que se aplica el tipo fijo',
      'Si se lee como variable',
    ]);
    expect(text(root, '[data-total="fees"] [data-total-amount]')).toBe(
      'Nada en la lectura más baja',
    );
  });

  it('a total under a euro reads «menos de 1 €», never «unos 0 €»', () => {
    const root = rendered(
      review({
        deedOn: d('2015-03-02'),
        rateRevisionMonths: 12,
        prepaymentOption: null,
        operations: [
          {
            on: d('2023-05-02'),
            kind: 'partial_prepayment',
            principal: 20_000,
            feeCharged: 50.4,
            hadInsurance: null,
          },
        ],
      }),
      false,
    );
    expect(text(root, '[data-total="fees"] [data-total-amount]')).toBe('menos de 1 €');
  });

  it('flags a clause with what the law or a court says, dated, and only rulings read', () => {
    const root = rendered(
      review({
        deedOn: d('2010-06-01'),
        clauses: [
          { label: 'floor_clause', present: true, floorPercent: 3 },
          { label: 'irph', present: null },
        ],
      }),
      false,
    );
    const floor = root.querySelector('[data-item="floor_clause"]');
    expect(text(floor ?? root, '[data-status-text]')).toBe('Aparece en tu escritura');
    expect(text(floor ?? root, '[data-reading-title]')).toBe(
      'Lo que dicen los tribunales · estado a 10-10-2026',
    );
    expect(floor?.textContent).toContain('Tu escritura fija un tipo mínimo del 3 %.');
    expect(floor?.textContent).toContain('STS 241/2013, de 9 de mayo (Pleno)');
    expect(text(root, '[data-item="irph"] [data-status-text]')).toBe('No sabes si aparece');
  });
});
