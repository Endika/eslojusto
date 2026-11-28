// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { INSURANCE_NORMS } from '../../src/engine/insurance/data/norms';
import { reviewInsurance, type InsuranceReview } from '../../src/engine/insurance/review';
import type { InsuranceInput } from '../../src/engine/insurance/types';
import { es } from '../../src/i18n/es';
import type { Translate } from '../../src/i18n/client';
import { phraseText, renderInsuranceResult } from '../../src/insurance/render';
import { notice, policy, TODAY } from '../engine/insurance/input';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('insurance');

const review = (input: InsuranceInput, today = TODAY): InsuranceReview => {
  const r = reviewInsurance(input, today, { norms: INSURANCE_NORMS });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.review;
};

// The result's hooks and templates, as InsuranceResult.astro has them.
function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
    </section>
    <div data-items></div>
    <section data-in-scope><div data-information></div></section>
    <section data-in-scope><ul data-unchecked></ul></section>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span><h3 data-title></h3>
        <p><svg data-mark><use href="#x"></use></svg><span data-status-text></span></p>
        <ol data-calculation></ol><h4 data-rules-title></h4><ul data-rules></ul>
      </section>
    </template>
    <template data-template="rule"><li><a></a><span data-rule-status></span></li></template>
    <template data-template="information">
      <details><summary data-info-title></summary><p data-info-text></p><ul data-info-links></ul></details>
    </template>`;
  return root;
}

const cards = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-item]')].map((card) => ({
    item: card.dataset['item'],
    status: card.querySelector('[data-status-text]')?.textContent,
  }));

describe('the insurance result', () => {
  it('gives each date with the days left, the notice as a fact and the premium as data', () => {
    const root = result();
    const input = policy({ notice: notice({ receivedOn: parseDate('2027-01-20') }) });
    renderInsuranceResult(root, review(input, parseDate('2027-01-25')), tr);
    expect(cards(root)).toEqual([
      { item: 'non_renewal', status: 'Abierto hasta el 01-02-2027 (7 días desde hoy)' },
      {
        item: 'change_notice',
        status: 'Llegó con 40 días de antelación: la ley pide al menos dos meses',
      },
      { item: 'premium', status: 'Tu prima sube un 15 % (45,00 €)' },
      { item: 'distance_withdrawal', status: 'No aplica' },
    ]);
    const text = root.textContent ?? '';
    expect(text).toContain('El aviso te llegó el 20-01-2027, 40 días antes del vencimiento');
    expect(text).toContain('como tarde el 01-02-2027');
    expect(text).toContain('Ley de Contrato de Seguro, art. 22.2');
    expect(text).toContain('con efectos desde el 01-01-2016 · en vigor');
  });

  it('counts the withdrawal from the receipt of the terms', () => {
    const root = result();
    const input = policy({
      distance: true,
      concludedOn: parseDate('2026-10-01'),
      policyReceivedOn: parseDate('2026-10-05'),
    });
    renderInsuranceResult(root, review(input), tr);
    expect(cards(root).at(-1)).toEqual({
      item: 'distance_withdrawal',
      status: 'Abierto hasta el 19-10-2026 (10 días desde hoy)',
    });
    expect(root.textContent).toContain('desde que recibes las condiciones del contrato');
  });

  it('leaves a motor policy bought online to review for its voluntary covers', () => {
    const root = result();
    const input = policy({
      line: 'car',
      carCover: 'with_voluntary',
      mortgageRequired: null,
      distance: true,
      concludedOn: parseDate('2026-10-01'),
    });
    renderInsuranceResult(root, review(input), tr);
    expect(cards(root).slice(-2)).toEqual([
      { item: 'distance_withdrawal_compulsory', status: 'No aplica' },
      { item: 'distance_withdrawal_voluntary', status: 'Para revisar' },
    ]);
  });

  it('words every phrase the engine can give', () => {
    const keys = Object.keys(es).filter((k) => k.startsWith('client.insurance.calculation.'));
    // Fill every variable with a figure of each kind, so none is left in braces.
    const filled = (key: string) =>
      phraseText(
        {
          key: key.replace('client.insurance.calculation.', '') as never,
          vars: Object.fromEntries(
            [...(es[key as keyof typeof es] as string).matchAll(/\{(\w+)\}/g)].map(([, n]) => [
              n,
              { days: 3 },
            ]),
          ),
        },
        tr,
      );
    for (const key of keys) expect(filled(key), key).not.toMatch(/[{}]|client\.insurance/);
  });
});
