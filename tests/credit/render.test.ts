// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { CREDIT_SOURCES } from '../../src/engine/credit/data/sources';
import { reviewCredit, type CreditReview } from '../../src/engine/credit/review';
import type { CreditInput } from '../../src/engine/credit/types';
import { parseDate } from '../../src/engine/date';
import type { Translate } from '../../src/i18n/client';
import {
  lawSourceText,
  monthText,
  normStatusText,
  phraseText,
  renderCreditResult,
  renderOutOfScope,
} from '../../src/credit/render';
import { loan, repayment, TODAY } from '../engine/credit/input';
import { DEPS, result } from './fixtures';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('credit');

const review = (input: CreditInput): CreditReview => {
  const r = reviewCredit(input, TODAY, DEPS);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.review;
};

const cards = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-item]')].map((card) => ({
    item: card.dataset['item'],
    status: card.querySelector('[data-status-text]')?.textContent,
  }));

describe('the credit result', () => {
  it('gives the APR first, then the indicator and the withdrawal: no early repayment, no item', () => {
    const root = result();
    renderCreditResult(root, review(loan({ confirmedApr: true })), false, tr);
    expect(cards(root)).toEqual([
      {
        item: 'apr',
        status:
          'La TAE de tu contrato es más baja que la que sale de sus cifras (12,00 % frente a 16,61 %)',
      },
      { item: 'indicator', status: 'Diferencia con el tipo medio: 8,51 puntos' },
      { item: 'withdrawal', status: 'El plazo terminó el 01-03-2019' },
    ]);
    const indicator = root.querySelectorAll('[data-item]')[1];
    expect(indicator?.textContent).toContain('febrero de 2019');
    expect(indicator?.textContent).toContain('8,0989 %');
    expect(indicator?.textContent).toContain('criterio del Tribunal Supremo');
    expect(root.textContent).not.toMatch(/\{\w+\}/);
  });

  it('shows the law’s own rate plainly and the euros over the cap', () => {
    const root = result();
    renderCreditResult(
      root,
      review(
        loan({ earlyRepayment: repayment({ interestSettled: null, compensationCharged: 80 }) }),
      ),
      false,
      tr,
    );
    const card = root.querySelectorAll('[data-item]')[2];
    expect(card?.textContent).toContain('Por encima del tope general del art. 30 (30,00 €)');
    expect(card?.textContent).toContain('el 1 % da 50,00 €');
  });

  it('lays out each reading of a point the person did not know', () => {
    const root = result();
    renderCreditResult(
      root,
      review(
        loan({
          charges: [],
          netDisbursed: null,
          insurance: { premium: 600, single: true, financed: false, required: null },
        }),
      ),
      false,
      tr,
    );
    const apr = root.querySelector('[data-item="apr"]');
    expect(apr?.querySelector('[data-status-text]')?.textContent).toBe(
      'Depende de un dato que no sabes',
    );
    expect(
      [...(apr?.querySelectorAll('[data-reading-title]') ?? [])].map((h) => h.textContent),
    ).toEqual(['Si el seguro era obligatorio', 'Si no lo era']);
  });

  it('marks a draft as not applied, with no day it took effect', () => {
    const law = review(loan()).information.find((b) => b.id === 'law_change');
    const draft = law?.sources.find((s) => s.status === 'draft');
    expect(draft && normStatusText(draft, tr)).toBe('en tramitación: no se aplica');
    const inForce = law?.sources.find((s) => s.status === 'in_force');
    expect(inForce).toBeUndefined();
    const apr = review(loan()).items[0];
    const source = apr?.kind === 'single' ? apr.finding.sources[0] : undefined;
    expect(source && normStatusText(source, tr)).toBe('con efectos desde el 25-09-2011 · en vigor');
  });

  it('dates a court criterion and says when it was not read in the ruling', () => {
    const root = result();
    renderCreditResult(root, review(loan()), false, tr);
    const rules = [...(root.querySelectorAll('[data-item="indicator"] [data-rules] li') ?? [])];
    const sts366 = rules.find((li) => li.querySelector('a')?.textContent?.startsWith('STS 366'));
    expect(sts366?.querySelector('[data-rule-status]')?.textContent).toBe(
      'criterio del Tribunal Supremo · estado a 19-10-2026',
    );
    expect(lawSourceText(CREDIT_SOURCES.sts258_2023, tr)).toBe(
      'criterio del Tribunal Supremo · estado a 19-10-2026',
    );
    expect(lawSourceText({ ...CREDIT_SOURCES.sts366_2026, verified: false }, tr)).toBe(
      'criterio del Tribunal Supremo · estado a 19-10-2026 · sin comprobar en el texto de la sentencia',
    );
  });

  it('locked with something to claim, counts the points and their euros without naming them', () => {
    const r = review(
      loan({ earlyRepayment: repayment({ interestSettled: null, compensationCharged: 80 }) }),
    );
    expect(r.offerPass).toBe(true);
    const root = result();
    renderCreditResult(root, r, true, tr);
    expect(cards(root).map((c) => c.item)).toEqual(['indicator', 'withdrawal']);
    expect(root.querySelectorAll('[data-item="apr"], [data-item="early_repayment"]')).toHaveLength(
      0,
    );
    expect(root.textContent).not.toContain('art. 30');
    const count = root.querySelector('[data-count]');
    expect(count?.hasAttribute('hidden')).toBe(false);
    // Whole euros carry a non-breaking space before the sign.
    expect(count?.textContent?.replace(/\s/g, ' ')).toBe(
      'Son 2 puntos. Lo cobrado por encima de lo que permite la ley suma unos 30 €.',
    );
    expect(root.querySelector('[data-lead]')?.textContent).toBe(
      'Cuántos puntos podrían no cuadrar y, si hay euros, cuánto suman, redondeado. Cuáles son, con su cuenta y la norma en que se apoyan, va con el pase.',
    );
    expect(root.querySelector('[data-unchecked]')?.children.length).toBeGreaterThan(0);

    renderCreditResult(root, r, false, tr);
    expect(cards(root).map((c) => c.item)).toEqual([
      'apr',
      'indicator',
      'early_repayment',
      'withdrawal',
    ]);
    expect(root.querySelector('[data-count]')?.hasAttribute('hidden')).toBe(true);
  });

  it('locked with only the APR to claim, says it is one point and no euros', () => {
    const root = result();
    renderCreditResult(root, review(loan()), true, tr);
    expect(root.querySelector('[data-count]')?.textContent).toBe('Es un punto.');
    expect(cards(root).map((c) => c.item)).toEqual(['indicator', 'withdrawal']);
  });

  it('locked with nothing to claim, shows every point as before', () => {
    const r = review(loan({ declaredApr: 16.61 }));
    expect(r.offerPass).toBe(false);
    const root = result();
    renderCreditResult(root, r, true, tr);
    expect(cards(root).map((c) => c.item)).toEqual(['apr', 'indicator', 'withdrawal']);
    expect(root.querySelector('[data-count]')?.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('[data-lead]')?.textContent).toBe(tr('client.credit.result.lead'));
  });

  it('a credit outside the review says why and works nothing out', () => {
    const root = result();
    renderOutOfScope(root, { inScope: false, reason: 'before_lcc' }, tr);
    expect(root.querySelector('[data-out-of-scope]')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[data-out-of-scope-reason]')?.textContent).toContain(
      'Lo contrataste antes del 25-09-2011',
    );
    expect(root.querySelectorAll('[data-item]')).toHaveLength(0);
  });

  it('a card from before the 2011 law leads with why it gets only the indicator', () => {
    const root = result();
    renderCreditResult(
      root,
      review(
        loan({
          product: 'revolving',
          agreedOn: parseDate('2009-04-01'),
          drawnOn: parseDate('2009-04-01'),
          principal: 1_500,
          instalments: null,
          charges: [],
          netDisbursed: null,
          declaredApr: 24.6,
          card: { limit: 1_500, nominalRate: 22, annualFee: 0, minimumPayment: 60, balance: 0 },
        }),
      ),
      false,
      tr,
    );
    expect(root.querySelector('[data-lead]')?.textContent).toContain(
      'Tu tarjeta es anterior al 25-09-2011',
    );
    expect(cards(root)).toEqual([
      { item: 'indicator', status: 'Por debajo del umbral de 6 puntos (5,28 puntos)' },
    ]);
  });
});

describe('the credit phrases', () => {
  it('write a month in words and a deadline open today as such', () => {
    expect(monthText('2019-02', tr)).toBe('febrero de 2019');
    expect(
      phraseText(
        { key: 'withdrawal.days_left', vars: { days: { days: 0 }, day: { date: '2026-10-09' } } },
        tr,
      ),
    ).toBe('Hoy, 09-10-2026, es el último día.');
  });
});
