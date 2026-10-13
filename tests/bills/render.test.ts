// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderElectricityResult } from '../../src/bills/electricity/render';
import {
  phraseText,
  renderOutOfScope,
  rowText,
  statusText,
  summaryKind,
} from '../../src/bills/result';
import { renderTelecomResult } from '../../src/bills/telecom/render';
import { BILLS_NORMS } from '../../src/engine/bills/data/norms';
import { BILLS_SOURCES } from '../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../src/engine/bills/data/tables';
import {
  reviewElectricityBill,
  type ElectricityReview,
} from '../../src/engine/bills/electricity-review';
import { billsPhrase } from '../../src/engine/bills/calculation';
import type { BillFinding } from '../../src/engine/bills/finding';
import { reviewTelecom, type TelecomReview } from '../../src/engine/bills/telecom-review';
import type { ElectricityBillInput, TelecomInput } from '../../src/engine/bills/types';
import { parseDate } from '../../src/engine/date';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { freeBill, juneBill, meter, telecom, TODAY } from '../engine/bills/input';

const tr: Translate = (key, vars) => t('es', key, vars);

const electricity = (input: ElectricityBillInput): ElectricityReview => {
  const r = reviewElectricityBill(input, TODAY, { norms: BILLS_NORMS, tables: BILLS_TABLES });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.review;
};
const exit = (input: TelecomInput): TelecomReview => {
  const r = reviewTelecom(input, TODAY, {
    norms: BILLS_NORMS,
    sources: BILLS_SOURCES,
    tables: { holidays: BILLS_TABLES.holidays },
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.review;
};

// The result's hooks and templates, as BillsResult.astro has them.
function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
    </section>
    <section data-in-scope data-totals>
      <p data-total-counted></p><p data-total-up-to hidden></p><p data-total-under hidden></p>
      <p data-recurring hidden></p>
    </section>
    <div data-items></div>
    <section data-in-scope><ul data-unchecked></ul></section>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span><h3 data-title></h3>
        <p><svg data-mark><use href="#x"></use></svg><span data-status-text></span></p>
        <p data-depends hidden></p>
        <ol data-calculation></ol><div data-readings></div>
        <h4 data-rules-title></h4><ul data-rules></ul>
        <h4 data-rows-title></h4><ul data-rows></ul>
      </section>
    </template>
    <template data-template="reading">
      <div><h4 data-reading-title></h4><p data-reading-status></p><ol data-calculation></ol></div>
    </template>
    <template data-template="rule"><li><a></a><span data-rule-status></span></li></template>`;
  return root;
}

const text = (root: HTMLElement, selector: string) =>
  root.querySelector(selector)?.textContent ?? '';
const cards = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('[data-item]')].map((card) => ({
    title: text(card, '[data-title]'),
    state: card.dataset['state'],
    status: text(card, '[data-status-text]'),
  }));
const cardText = (root: HTMLElement, title: string) =>
  [...root.querySelectorAll<HTMLElement>('[data-item]')].find(
    (card) => text(card, '[data-title]') === title,
  )?.textContent ?? '';

describe('the electricity result', () => {
  it('says a June bill that matches does so line by line, with nothing over the norm', () => {
    const root = result();
    const input = juneBill();
    const review = electricity(input);
    renderElectricityResult(root, review, input, BILLS_NORMS, tr);
    expect(text(root, '[data-lead]')).toBe(
      'Con lo que has metido, cada línea cuadra con tus propios precios y con lo que fija la norma.',
    );
    expect(text(root, '[data-total-counted]')).toBe('0,00 €');
    expect(root.querySelector<HTMLElement>('[data-total-under]')?.hidden).toBe(true);
    expect(cards(root).slice(0, 4)).toEqual([
      { title: 'Días facturados', state: 'matches', status: 'Cuadra' },
      { title: 'Término de potencia · P1 (punta)', state: 'matches', status: 'Cuadra' },
      { title: 'Término de potencia · P2 (valle)', state: 'matches', status: 'Cuadra' },
      { title: 'Término de energía · P1 (punta)', state: 'matches', status: 'Cuadra' },
    ]);
    expect(cardText(root, 'Término de potencia · P1 (punta)')).toContain(
      '4,6 kW × 30,817413 €/kW y año × 30 días / 365 = 11,65 €.',
    );
  });

  it('gives the power used as a figure, never as advice', () => {
    const root = result();
    const input = juneBill();
    renderElectricityResult(root, electricity(input), input, BILLS_NORMS, tr);
    const power = cardText(root, 'Potencia que usaste');
    expect(power).toContain(
      'La potencia máxima que usaste en los últimos 12 meses, según tu factura: 3,1 kW en punta y 1,2 kW en valle.',
    );
    expect(power).toContain('se puede cambiar una vez cada 12 meses');
    expect(power).not.toMatch(/demandada|baja tu potencia/);
  });

  it('counts a meter over the regulated price and says it comes back every bill', () => {
    const root = result();
    const input = juneBill({
      meter: meter({ amount: 1.5 }),
      vat: { base: null, percent: 21, amount: 10.69 },
      total: 61.61,
    });
    renderElectricityResult(root, electricity(input), input, BILLS_NORMS, tr);
    expect(text(root, '[data-total-counted]')).toBe('0,70 €');
    expect(root.querySelector<HTMLElement>('[data-recurring]')?.hidden).toBe(false);
    expect(cards(root).find((c) => c.title === 'Alquiler del contador')).toEqual({
      title: 'Alquiler del contador',
      state: 'above_regulated_price',
      status: 'Por encima del precio regulado: 0,70 € de más',
    });
    expect(cardText(root, 'Alquiler del contador')).toContain(
      'Orden IET/1491/2013, disposición transitoria única',
    );
  });

  it('names a service by its label and counts it only when it was not asked for', () => {
    const root = result();
    const input = freeBill({
      services: [{ label: 'maintenance', amount: 5, requested: 'no' }],
      electricityTax: { base: null, percent: null, amount: 2.57 },
      vat: { base: null, percent: 21, amount: 12.32 },
      total: 70.97,
    });
    renderElectricityResult(root, electricity(input), input, BILLS_NORMS, tr);
    expect(cards(root).find((c) => c.title.startsWith('Servicio'))).toEqual({
      title: 'Servicio aparte de la luz · Mantenimiento',
      state: 'paid_over',
      status: 'Por encima de lo que permite la norma: 5,00 € de más',
    });
    expect(text(root, '[data-total-counted]')).toBe('5,00 €');
  });

  it('shows a total charged short as plainly as one over, apart from what is counted', () => {
    const root = result();
    const input = juneBill({ total: 60.5 });
    const review = electricity(input);
    renderElectricityResult(root, review, input, BILLS_NORMS, tr);
    expect(cards(root).find((c) => c.title === 'Total de la factura')?.status).toBe(
      'No cuadra: 0,27 € de menos',
    );
    expect(text(root, '[data-lead]')).toContain('hay líneas que no cuadran');
    expect(summaryKind(review.items, review.totals)).toBe('open');
  });

  it('never reads as all clear beside a line to review', () => {
    const input = juneBill({ excessPower: { amount: 2, maximeter: false }, total: 62.77 });
    const review = electricity(input);
    expect(review.totals.counted).toBe(0);
    expect(summaryKind(review.items, review.totals)).toBe('open');
  });

  it('shows a tax still pending its condition as two readings', () => {
    const root = result();
    const input = juneBill({
      issuedOn: parseDate('2026-10-02'),
      dueOn: parseDate('2026-11-05'),
      readingFrom: parseDate('2026-08-31'),
      readingTo: parseDate('2026-09-30'),
    });
    renderElectricityResult(root, electricity(input), input, BILLS_NORMS, tr);
    const tax = root.querySelector<HTMLElement>('[data-item="vat"]');
    expect(tax?.dataset['state']).toBe('depends');
    expect(tax?.querySelector('[data-depends]')?.textContent).toContain(
      'el total cuenta la lectura más baja',
    );
    expect(tax?.textContent).toContain('pendiente: Que el IPC de la electricidad de septiembre');
  });
});

describe('the telecom result', () => {
  it('counts a commitment penalty over its proportional share', () => {
    const root = result();
    renderTelecomResult(root, exit(telecom({ penaltyCharged: 120 })), BILLS_NORMS, tr);
    expect(cards(root)).toEqual([
      {
        title: 'Penalización por permanencia',
        state: 'paid_over',
        status: 'Por encima de lo que permite la norma: 59,67 € de más',
      },
    ]);
    expect(text(root, '[data-total-counted]')).toBe('59,67 €');
    expect(cardText(root, 'Penalización por permanencia')).toContain(
      'Penalización pactada 180,00 € × 184 días que faltaban / 549 días de permanencia = 60,33 €.',
    );
  });

  it('says so when there is nothing to check', () => {
    const root = result();
    renderTelecomResult(
      root,
      exit(telecom({ commitment: null, penaltyCharged: 0, lines: [] })),
      BILLS_NORMS,
      tr,
    );
    expect(text(root, '[data-lead]')).toBe(
      'Con lo que has metido no hay penalización ni cobros de después de la baja que comprobar.',
    );
  });
});

describe('the words of a result', () => {
  it('stops at the gate with the reason, and nothing worked out', () => {
    const root = result();
    renderOutOfScope(root, { inScope: false, reason: 'canary_ceuta_melilla' }, tr);
    expect(text(root, '[data-out-of-scope-reason]')).toBe(
      'Esta revisión todavía no cubre tu territorio: en Canarias, Ceuta y Melilla la luz lleva otros impuestos y otros horarios.',
    );
    expect(root.querySelector<HTMLElement>('[data-totals]')?.hidden).toBe(true);
  });

  it('words a figure by its unit', () => {
    expect(
      phraseText(
        billsPhrase('meter.cap', {
          phase: { integer: 3 },
          days: { days: 1 },
          euros: { euros: 0.04 },
        }),
        tr,
      ),
    ).toBe(
      'El alquiler regulado de un contador trifásico por 1 día es como mucho 0,04 €: el precio al mes por 12 meses, repartido por días.',
    );
    expect(phraseText(billsPhrase('power.max_used', { p1: { kw: 3.1 } }), tr)).toBe(
      'La potencia máxima que usaste en punta en los últimos 12 meses, según tu factura: 3,1 kW.',
    );
    expect(
      phraseText(
        billsPhrase('commitment.over_maximum', {
          months: { integer: 30 },
          maximum: { integer: 24 },
        }),
        tr,
      ),
    ).toBe(
      'Tu permanencia es de 30 meses, y la ley pone un máximo de 24 meses para los consumidores.',
    );
  });

  it('says which way a line is off', () => {
    const f = (direction: 'over' | 'under'): BillFinding =>
      ({ status: 'differs_from_official', amount: 1.2, direction }) as BillFinding;
    expect(statusText(f('over'), tr)).toBe('1,20 € por encima del valor oficial');
    expect(statusText(f('under'), tr)).toBe('1,20 € por debajo del valor oficial');
  });

  it('marks the 2016 PVPC margin as a value never updated', () => {
    const row = {
      from: '2026-01-01',
      until: '2026-12-31',
      norm: 'order_etu1948_2016',
      url: 'https://www.boe.es/',
      status: 'in_force',
      doubt: 'ccf_not_updated_since_2016',
    } as const;
    expect(rowText(row, BILLS_NORMS, tr)).toBe(
      'con efectos del 01-01-2026 al 31-12-2026 · valor de 2016 sin actualizar',
    );
  });
});
