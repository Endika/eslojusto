// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  chargesMemory,
  readBills,
  renderCharges,
  type ReadBill,
} from '../../src/bills/telecom/charges';
import { telecomReading } from '../../src/bills/telecom/reading';
import type { ExtractedValue, TelecomExtraction } from '../../src/documents/contract';
import { parseDate } from '../../src/engine/date';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';

const tr: Translate = (key, vars) => t('es', key, vars);
const TODAY = parseDate('2026-10-15');

const row = (values: Record<string, ExtractedValue>) => ({
  values,
  confidence: 'high' as const,
  source: 'telecom_bill' as const,
});

const telecom = (e: Partial<TelecomExtraction>): TelecomExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  bills: [],
  lines: [],
  ...e,
});

// Two synthetic bills of a made-up operator: the newer with a discount that ended on 30-09-2026,
// a premium-rate message and a third party's charge.
const READ = telecom({
  bills: [
    row({ document: 1, operatorName: 'Operador Ficticio', issuedOn: '2026-08-22', total: 30 }),
    row({
      document: 2,
      operatorName: 'Operador Ficticio',
      issuedOn: '2026-09-22',
      periodFrom: '2026-09-01',
      periodTo: '2026-09-30',
      total: 33,
    }),
  ],
  lines: [
    row({ document: 1, concept: 'Tarifa Ficticia 50', kind: 'fixed_fee', amount: 23.14 }),
    row({ document: 2, concept: 'Tarifa Ficticia 50', kind: 'fixed_fee', amount: 23.14 }),
    row({
      document: 2,
      concept: 'Descuento de bienvenida',
      kind: 'discount',
      from: '2025-09-30',
      to: '2026-09-30',
      amount: 4.13,
    }),
    row({ document: 2, concept: 'SMS 79xx', kind: 'premium_rate', amount: 1.45 }),
    row({ document: 2, concept: 'Suscripción de juegos', kind: 'third_party', amount: 3.99 }),
    row({ document: 2, kind: 'other', amount: 0 }),
    row({ document: 2, concept: 'Sin importe', kind: 'other' }),
  ],
});

// The block as TelecomCharges.astro has it.
function block(): HTMLElement {
  const root = document.createElement('section');
  root.hidden = true;
  root.innerHTML = `
    <p data-charges-extras hidden></p><p data-charges-fees hidden></p>
    <div data-charges-bills></div>
    <div data-charges-promotions hidden><ul data-charges-promotion-list></ul></div>
    <div data-charges-rights hidden>
      <div data-charges-right="disconnect" hidden></div>
      <div data-charges-right="unrequested" hidden></div>
    </div>
    <template data-template="charges-bill">
      <section><h4 data-bill-title></h4><div data-bill-groups></div></section>
    </template>
    <template data-template="charges-group">
      <div><p data-group-title></p><ul data-group-lines></ul></div>
    </template>
    <template data-template="charges-line">
      <li><span data-line-concept></span><span data-line-extra hidden></span>
      <span data-line-period hidden></span><bdi data-line-amount></bdi></li>
    </template>`;
  return root;
}

const hidden = (root: HTMLElement, selector: string) =>
  root.querySelector<HTMLElement>(selector)?.hidden;
const texts = (root: ParentNode, selector: string) =>
  [...root.querySelectorAll(selector)].map((el) => el.textContent?.replace(/\s+/g, ' ').trim());

describe('the bills read', () => {
  it('keeps each bill with its lines, newest first, and leaves out a line without amount', () => {
    const bills = readBills(READ);
    expect(bills.map((b) => b.issuedOn)).toEqual([
      parseDate('2026-09-22'),
      parseDate('2026-08-22'),
    ]);
    expect(bills[0]?.lines.map((l) => [l.concept, l.kind, l.amount])).toEqual([
      ['Tarifa Ficticia 50', 'fixed_fee', 23.14],
      ['Descuento de bienvenida', 'discount', 4.13],
      ['SMS 79xx', 'premium_rate', 1.45],
      ['Suscripción de juegos', 'third_party', 3.99],
      [null, 'other', 0],
    ]);
  });

  it('keeps the lines of a bill whose row was not read, and an unknown kind as other', () => {
    const [bill] = readBills(
      telecom({ lines: [row({ document: 3, concept: 'Algo', kind: 'gift', amount: 2 })] }),
    );
    expect(bill).toMatchObject({ operator: null, issuedOn: null, lines: [{ kind: 'other' }] });
  });

  it('adds the bills of a later read and keeps the latest reading of a bill read again', () => {
    const memory = chargesMemory();
    memory.add(readBills(READ));
    const [newest] = readBills(READ);
    if (!newest) throw new Error('No bill read');
    const again: ReadBill = { ...newest, lines: [] };
    memory.add([again]);
    expect(memory.bills()).toHaveLength(2);
    expect(memory.bills()[0]?.lines).toEqual([]);
    memory.clear();
    expect(memory.bills()).toEqual([]);
  });
});

describe('«Lo que te cobran»', () => {
  it('lists every line by bill and kind, marks the extras and dates each line', () => {
    const root = block();
    renderCharges(root, readBills(READ), TODAY, tr);
    expect(root.hidden).toBe(false);
    expect(texts(root, '[data-bill-title]')).toEqual([
      'Factura del 22-09-2026 · Operador Ficticio',
      'Factura del 22-08-2026 · Operador Ficticio',
    ]);
    const newest = root.querySelector('[data-charges-bills] > section') ?? root;
    expect(texts(newest, '[data-group-title]')).toEqual([
      'Cuotas de tus servicios',
      'Tarificación adicional: números 80x y 90x, SMS premium',
      'Servicios de terceros y compras cargadas a la factura',
      'Otros cobros',
      'Descuentos',
    ]);
    expect(texts(newest, '[data-line-amount]')).toEqual([
      '23,14 €',
      '1,45 €',
      '3,99 €',
      '0,00 €',
      '−4,13 €',
    ]);
    const extras = [...newest.querySelectorAll<HTMLElement>('[data-line-extra]')];
    expect(extras.map((e) => !e.hidden)).toEqual([false, true, true, false, false]);
    expect(extras.map((e) => e.textContent)).toEqual(['', 'Extra', 'Extra', '', '']);
    expect(texts(newest, '[data-line-concept]')).toContain('Concepto sin leer');
    expect(texts(newest, '[data-line-period]:not([hidden])')).toEqual([
      'Del 30-09-2025 al 30-09-2026',
    ]);
  });

  it('says when a discount ended and what the bill goes up by, without the VAT', () => {
    const root = block();
    renderCharges(root, readBills(READ), TODAY, tr);
    expect(hidden(root, '[data-charges-promotions]')).toBe(false);
    expect(texts(root, '[data-charges-promotion-list] li')).toEqual([
      'Descuento de bienvenida: terminó el 30-09-2026. Desde el día siguiente, tu factura es 4,13 € más alta, sin contar el IVA.',
    ]);
    renderCharges(root, readBills(READ), parseDate('2026-09-23'), tr);
    expect(texts(root, '[data-charges-promotion-list] li')).toEqual([
      'Descuento de bienvenida: termina el 30-09-2026. Desde el día siguiente, tu factura será 4,13 € más alta, sin contar el IVA.',
    ]);
  });

  it('shows the norms the extras call for, and no fees note beside a single monthly fee', () => {
    const root = block();
    renderCharges(root, readBills(READ), TODAY, tr);
    expect(hidden(root, '[data-charges-extras]')).toBe(false);
    expect(hidden(root, '[data-charges-fees]')).toBe(true);
    expect(hidden(root, '[data-charges-rights]')).toBe(false);
    expect(hidden(root, '[data-charges-right="disconnect"]')).toBe(false);
    expect(hidden(root, '[data-charges-right="unrequested"]')).toBe(false);
  });

  it('leaves the norm on disconnecting out without a premium-rate line, and both without extras', () => {
    const root = block();
    const third = telecom({
      lines: [row({ document: 1, concept: 'Compra', kind: 'third_party', amount: 2 })],
    });
    renderCharges(root, readBills(third), TODAY, tr);
    expect(hidden(root, '[data-charges-right="disconnect"]')).toBe(true);
    expect(hidden(root, '[data-charges-right="unrequested"]')).toBe(false);
    expect(hidden(root, '[data-charges-fees]')).toBe(true);
    const plain = telecom({
      lines: [row({ document: 1, concept: 'Tarifa', kind: 'fixed_fee', amount: 20 })],
    });
    renderCharges(root, readBills(plain), TODAY, tr);
    expect(hidden(root, '[data-charges-rights]')).toBe(true);
    const two = telecom({
      lines: [
        row({ document: 1, concept: 'Tarifa', kind: 'fixed_fee', amount: 20 }),
        row({ document: 1, concept: 'Televisión', kind: 'fixed_fee', amount: 9 }),
      ],
    });
    renderCharges(root, readBills(two), TODAY, tr);
    expect(hidden(root, '[data-charges-fees]')).toBe(false);
    renderCharges(root, readBills(plain), TODAY, tr);
    expect(hidden(root, '[data-charges-extras]')).toBe(true);
    expect(hidden(root, '[data-charges-promotions]')).toBe(true);
  });

  it('stays hidden while no bill has a line', () => {
    const root = block();
    renderCharges(root, [], TODAY, tr);
    expect(root.hidden).toBe(true);
  });

  it('fills from each read and empties when the form starts over', () => {
    const form = document.createElement('form');
    const root = block();
    const reading = telecomReading(form, tr, { root, today: () => TODAY });
    reading.prefill(telecom({}), {}, []);
    expect(root.hidden).toBe(true);
    reading.prefill(READ, {}, []);
    expect(texts(root, '[data-bill-title]')).toHaveLength(2);
    form.reset();
    expect(root.hidden).toBe(true);
    expect(texts(root, '[data-bill-title]')).toEqual([]);
  });
});
