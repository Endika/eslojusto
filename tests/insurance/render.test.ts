// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { INSURANCE_NORMS } from '../../src/engine/insurance/data/norms';
import { reviewInsurance, type InsuranceReview } from '../../src/engine/insurance/review';
import type { InsuranceInput } from '../../src/engine/insurance/types';
import { t } from '../../src/i18n';
import { es } from '../../src/i18n/es';
import type { Translate } from '../../src/i18n/client';
import {
  phraseText,
  renderInsuranceResult,
  renderOutOfScope,
  statusText,
} from '../../src/insurance/render';
import { notice, policy, TODAY } from '../engine/insurance/input';

const tr: Translate = (key, vars) => t('es', key, vars);

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
      { item: 'non_renewal', status: 'Te quedan 7 días (hasta el 01-02-2027)' },
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
    expect(text).toContain('con efectos desde el 17-04-1981 · en vigor');
  });

  it('says so on the last day, and when the period has ended', () => {
    const last = review(policy(), parseDate('2027-02-01')).findings[0];
    const after = review(policy(), parseDate('2027-02-02')).findings[0];
    if (!last || !after) throw new Error('no finding');
    expect(statusText(last, tr)).toBe('Hoy es el último día (01-02-2027)');
    expect(statusText(after, tr)).toBe('El plazo terminó el 01-02-2027');
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
      status: 'Te quedan 10 días (hasta el 19-10-2026)',
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
      { item: 'distance_withdrawal_voluntary', status: 'Revísalo' },
    ]);
  });

  it('leaves a home policy the mortgage may ask for to review, with no date', () => {
    const root = result();
    const input = policy({ distance: true, mortgageRequired: null });
    renderInsuranceResult(root, review(input), tr);
    expect(cards(root).at(-1)).toEqual({ item: 'distance_withdrawal', status: 'Revísalo' });
  });

  it('folds the information blocks and lists what it does not look at', () => {
    const root = result();
    renderInsuranceResult(root, review(policy()), tr);
    expect([...root.querySelectorAll('[data-info-title]')].map((el) => el.textContent)).toEqual([
      'Si la póliza no coincide con lo acordado',
      'Lo que declaras al contratar',
      'Si aseguras por menos de lo que vale',
      'Si aseguras por más de lo que vale',
    ]);
    expect(root.textContent).toContain('la aseguradora paga 20.000,00 €');
    expect(root.querySelectorAll('[data-unchecked] li')).toHaveLength(4);
  });

  it('stops a life policy with why, and nothing worked out', () => {
    const root = result();
    renderOutOfScope(root, 'life', tr);
    expect(root.querySelector('[data-out-of-scope]')?.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('[data-out-of-scope-reason]')?.textContent).toContain(
      'los seguros de vida',
    );
    expect(root.querySelectorAll('[data-item]')).toHaveLength(0);
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
