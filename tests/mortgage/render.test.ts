// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { formatWholeEuros } from '../../src/calculator/number';
import { parseDate } from '../../src/engine/date';
import { reviewMortgage, type MortgageReview } from '../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput } from '../../src/engine/mortgage/types';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import {
  phraseText,
  renderMortgageResult,
  renderOutOfScope,
  sourceText,
} from '../../src/mortgage/render';
import { DEPS, invoice, mortgage, READ_DEPS, TODAY } from '../engine/mortgage/input';

const tr: Translate = (key, vars) => t('es', key, vars);
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

const rendered = (r: MortgageReview): HTMLElement => {
  const root = result();
  renderMortgageResult(root, r, tr);
  return root;
};

// Text as read, with any run of spaces, the non-breaking ones among them, as one.
const plain = (s: string) => s.replace(/\s+/g, ' ').trim();
const text = (root: ParentNode, selector: string) =>
  plain(root.querySelector(selector)?.textContent ?? '');
const about = (euros: number) => plain(`unos ${formatWholeEuros(euros)}`);

const cards = (root: HTMLElement, list: string) =>
  [...root.querySelectorAll<HTMLElement>(`${list} [data-item]`)].map((card) => ({
    item: card.dataset['item'],
    status: card.querySelector('[data-status-text]')?.textContent,
  }));

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
    const r = review(deed2018(), READ_DEPS);
    const root = rendered(r);
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

  it('explains the split without a figure while its rulings are unread', () => {
    const root = rendered(review(deed2018()));
    expect(text(root, '[data-total="statute"] [data-total-amount]')).toBe(about(1_100));
    expect(text(root, '[data-total="case_law"] [data-total-amount]')).toBe('Sin cifra por ahora');
    expect(root.querySelector('[data-total-explained]')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[data-total-interest]')?.hasAttribute('hidden')).toBe(true);
    expect(cards(root, '[data-expenses]')).toEqual([
      {
        item: 'notary_loan',
        status:
          'Según el reparto del Tribunal Supremo, el 50 % le correspondía al banco (sin cifra por ahora)',
      },
      {
        item: 'registry_mortgage',
        status:
          'Según el reparto del Tribunal Supremo, el 100 % le correspondía al banco (sin cifra por ahora)',
      },
      { item: 'ajd_loan', status: 'La ley lo pone a cargo del banco: 1.100,00 €' },
    ]);
    const notary = root.querySelector('[data-item="notary_loan"]');
    expect(notary?.textContent).toContain('hace falta que el banco lo acepte o que un juez anule');
    expect(notary?.textContent).toContain('sin comprobar en el texto de la sentencia');
  });

  it('shows the notary’s record charged apart from what the lender bears', () => {
    const root = rendered(
      review({
        deedOn: d('2021-05-10'),
        invoices: [
          invoice('notary_loan', 700, paid('2021-05-10')),
          invoice('valuation', 400, paid('2021-04-20')),
          invoice('transparency_deed', 60, paid('2021-05-09')),
        ],
      }),
    );
    expect(text(root, '[data-total="statute"] [data-total-amount]')).toBe(about(700));
    expect(text(root, '[data-total-free]')).toBe(
      `Aparte, el acta notarial previa, que no debía cobrarse: ${about(60)}.`,
    );
    expect(cards(root, '[data-expenses]').map((c) => c.status)).toEqual([
      'La ley lo pone a cargo del banco: 700,00 €',
      'A tu cargo',
      'No debía cobrarse: 60,00 €',
    ]);
  });

  it('names in a fee’s readings only the points it is open on', () => {
    const root = rendered(
      review({
        deedOn: d('2015-03-02'),
        rateRevisionMonths: 12,
        operations: [
          {
            on: d('2023-05-02'),
            kind: 'partial_prepayment',
            principal: 20_000,
            feeCharged: 40,
            hadInsurance: null,
          },
        ],
      }),
    );
    const fee = root.querySelector('[data-item="partial_prepayment"]');
    expect(fee?.querySelector('[data-status-text]')?.textContent).toBe(
      'Depende de un dato que no sabes',
    );
    expect(
      [...(fee?.querySelectorAll('[data-reading-title]') ?? [])].map((h) => h.textContent),
    ).toEqual([
      'Con la norma de la fecha de tu escritura',
      'Si la ley de 2019 llega a tu escritura',
    ]);
    expect(text(root, '[data-total="fees"] [data-total-amount]')).toBe(
      'Nada en la lectura más baja',
    );
    expect(root.querySelector('[data-total-more]')?.hasAttribute('hidden')).toBe(false);
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
    );
    const floor = root.querySelector('[data-item="floor_clause"]');
    expect(text(floor ?? root, '[data-status-text]')).toBe('Aparece en tu escritura');
    expect(text(floor ?? root, '[data-reading-title]')).toBe(
      'Lo que dicen los tribunales · estado a 07-10-2026',
    );
    expect(floor?.textContent).toContain('Tu escritura fija un tipo mínimo del 3 %.');
    expect(floor?.textContent).not.toContain('STS 241/2013');
    expect(text(root, '[data-item="irph"] [data-status-text]')).toBe('No sabes si aparece');
  });

  it('says the law forbids a floor in a variable rate from 2019, with no figure left open', () => {
    const root = rendered(
      review({ deedOn: d('2020-03-02'), clauses: [{ label: 'floor_clause', present: true }] }),
    );
    const floor = root.querySelector('[data-item="floor_clause"]');
    expect(text(floor ?? root, '[data-reading-title]')).toBe('Lo que dice la ley');
    expect(floor?.textContent).toContain('la ley prohíbe');
    expect(root.textContent).not.toMatch(/\{\w+\}/);
  });

  it('hides what holds nothing and lists what it never looks at', () => {
    const root = rendered(review({}));
    const fees = root.querySelector('[data-fees]')?.closest('[data-in-scope]');
    expect(fees?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('[data-total="fees"]')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelectorAll('[data-unchecked] li')).toHaveLength(7);
    expect(root.textContent).toContain('El paso previo del art. 439 bis');
  });

  it('a mortgage outside the review says why and works nothing out', () => {
    const root = result();
    renderOutOfScope(root, { inScope: false, reason: 'developer_subrogation' }, tr);
    expect(root.querySelector('[data-out-of-scope]')?.hasAttribute('hidden')).toBe(false);
    expect(text(root, '[data-out-of-scope-status]')).toBe(
      'Esta revisión no cubre tu tipo de hipoteca',
    );
    expect(text(root, '[data-out-of-scope-reason]')).toContain('los pagó el promotor');
    expect(root.querySelector('[data-totals]')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelectorAll('[data-item]')).toHaveLength(0);
  });
});

describe('the mortgage sources', () => {
  it('give a norm its day and status, and a ruling its court and the day it was read', () => {
    const r = review(deed2018());
    const [tax] = r.expenses.items.find((i) => i.kind === 'ajd_loan')?.sources ?? [];
    expect(tax && sourceText(tax, tr)).toBe('con efectos desde el 10-11-2018 · en vigor');
    const sources = r.expenses.items.find((i) => i.kind === 'notary_loan')?.sources ?? [];
    expect(sources.map((s) => sourceText(s, tr))).toEqual([
      'Tribunal Supremo, Sala de lo Civil · estado a 07-10-2026 · sin comprobar en el texto de la sentencia',
      'Tribunal Supremo, Sala de lo Civil · estado a 07-10-2026 · sin comprobar en el texto de la sentencia',
      'Tribunal de Justicia de la Unión Europea · estado a 07-10-2026',
    ]);
  });
});

describe('the mortgage phrases', () => {
  it('write a year as it is written and an amount with its thousands dot', () => {
    expect(
      phraseText({ key: 'interest.not_published', vars: { year: { integer: 2027 } } }, tr),
    ).toBe(
      'El interés legal de 2027 aún no se ha publicado: se cuenta hasta el 31 de diciembre anterior.',
    );
    expect(
      phraseText({ key: 'fees.lcci_fixed_first', vars: { years: { integer: 10 } } }, tr),
    ).toContain('en los 10 primeros años');
  });
});
