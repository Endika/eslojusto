import { describe, expect, it } from 'vitest';
import { electricityCase } from '../../src/bills/electricity/case';
import type { CompletedElectricityReview } from '../../src/bills/electricity/ports';
import { telecomCase } from '../../src/bills/telecom/case';
import type { Block } from '../../src/documents/ports';
import { BILLS_NORMS } from '../../src/engine/bills/data/norms';
import { BILLS_SOURCES } from '../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../src/engine/bills/data/tables';
import { reviewElectricityBill } from '../../src/engine/bills/electricity-review';
import { reviewTelecom } from '../../src/engine/bills/telecom-review';
import type { ElectricityBillInput } from '../../src/engine/bills/types';
import { parseDate } from '../../src/engine/date';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { juneBill, meter, telecom, TODAY } from '../engine/bills/input';

const tr: Translate = (key, vars) => t('es', key, vars);

const electricity = (input: ElectricityBillInput): CompletedElectricityReview => {
  const r = reviewElectricityBill(input, TODAY, { norms: BILLS_NORMS, tables: BILLS_TABLES });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { input, review: r.review };
};

const lines = (blocks: readonly Block[]) =>
  blocks.map((b) =>
    ('text' in b ? b.text : 'label' in b ? `${b.label}: ${b.value ?? ''}` : b.type)
      .replace(/[\u00a0\u202f]/g, ' ')
      .replaceAll('\u2011', '-'),
  );

// The June bill with its meter charged at 1,00 € instead of 0,80 €.
const meterOver = (change: Partial<ElectricityBillInput> = {}) =>
  electricity(
    juneBill({
      meter: meter({ amount: 1 }),
      vat: { base: 50.42, percent: 21, amount: 10.59 },
      total: 61.01,
      ...change,
    }),
  );

// The same in July, falling due in November: its VAT at 10 % or 21 % is not settled yet, and a line
// on it comes out charged short.
const july = meterOver({
  readingFrom: parseDate('2026-06-30'),
  readingTo: parseDate('2026-07-30'),
  dueOn: parseDate('2026-11-10'),
});

describe('the report of a year of bills', () => {
  const report = electricityCase([meterOver(), july], BILLS_NORMS).report(tr, TODAY);
  const all = lines(report.blocks);

  it('lists every bill with its lines, their calculation and the rules with how each norm stands', () => {
    expect(all).toContain('Factura del 31-05-2026 al 30-06-2026');
    expect(all).toContain('Factura del 30-06-2026 al 30-07-2026');
    expect(all).toContain('Alquiler del contador: Por encima del precio regulado: 0,20 € de más');
    expect(all).toContain(
      'El alquiler regulado de un contador monofásico por 30 días es como mucho 0,80 €: el precio al mes por 12 meses, repartido por días.',
    );
    expect(all).toContain('4,6 kW × 30,817413 €/kW y año × 30 días / 365 = 11,65 €.');
    expect(all).toContain(
      'Real Decreto 88/2026, art. 38 (Real Decreto 88/2026, por el que se aprueba el Reglamento general de suministro, comercialización y agregación de energía eléctrica) · con efectos desde el 12-02-2026 · en vigor',
    );
  });

  it('gives the table values each official figure rests on, with their days', () => {
    expect(all).toContain(
      'Valor oficial usado: Orden IET/1491/2013, de 1 de agosto · con efectos desde el 01-01-2026',
    );
  });

  it('gives each reading of a line the norms leave open, and the condition it waits on', () => {
    expect(all).toContain('IVA: Depende de algo aún sin decidir');
    expect(all).toContain(
      'Depende de una norma o de un dato oficial que aún no está decidido: el total cuenta la lectura más baja.',
    );
    expect(all.some((l) => l.startsWith('Con el valor oficial más bajo: '))).toBe(true);
    expect(all.some((l) => l.startsWith('Con el valor oficial más alto: '))).toBe(true);
    expect(all.some((l) => l.startsWith('Valor oficial usado: ') && l.includes('pendiente'))).toBe(
      true,
    );
  });

  it('adds up what is counted, with what is charged short and the estimate apart', () => {
    const year = all.slice(
      all.indexOf('Lo que suman tus facturas'),
      all.indexOf('Línea por línea'),
    );
    expect(year).toContain('Por encima de la norma: 0,40 €');
    expect(year.some((l) => l.startsWith('Y hasta '))).toBe(true);
    expect(year.some((l) => /^Cobrado de menos: .* Va aparte/.test(l))).toBe(true);
    expect(year).toContain(
      'Estimación, no una cifra de tus facturas, y no se suma a ningún total: si lo que se repite (Alquiler del contador) siguiera igual, en un año serían unos 2 €.',
    );
  });
});

describe('the report of a phone exit', () => {
  it('gives the penalty with its calculation and its rule', () => {
    const r = reviewTelecom(telecom({ penaltyCharged: 120 }), TODAY, {
      norms: BILLS_NORMS,
      sources: BILLS_SOURCES,
      tables: { holidays: BILLS_TABLES.holidays },
    });
    if (!r.ok) throw new Error('invalid');
    const all = lines(
      telecomCase(
        { input: telecom({ penaltyCharged: 120 }), review: r.review },
        BILLS_NORMS,
      ).report(tr, TODAY).blocks,
    );
    expect(all).toContain(
      'Penalización por permanencia: Por encima de lo que permite la norma: 59,67 € de más',
    );
    expect(
      all.some((l) => l.includes('art. 62.5') && l.includes('con efectos desde el 01-01-2022')),
    ).toBe(true);
  });
});
