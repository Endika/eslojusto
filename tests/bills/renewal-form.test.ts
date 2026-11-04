// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  SHEET_FIELDS,
  SHEETS,
  readRenewalForm,
  sheetErrors,
  sheetOfField,
} from '../../src/bills/renewal/form';
import { RENEWAL_FIELDS } from '../../src/bills/renewal/ports';
import { renewalPrefill } from '../../src/bills/renewal/prefill';
import type { RenewalExtraction } from '../../src/documents/contract';
import { pageTranslator } from '../support/page-strings';
import { naturgy, TODAY } from './renewal-support';

type Values = Readonly<Record<string, string | null>>;

// The Naturgy letter as the form asks it; tests change what they check. A null value leaves the
// question out, as a hidden question is.
const LETTER: Values = {
  letterDate: '2026-10-31',
  renewalDate: '2026-12-10',
  powerKwP1: '5,75',
  powerKwP2: '5,75',
  powerUnit: 'per_kw_day',
  currentPowerP1: '0,110283',
  currentPowerP2: '0,033469',
  nextPowerP1: '0,12303',
  nextPowerP2: '0,052329',
  energyPricing: 'single',
  currentEnergy: '0,144972',
  nextEnergy: '0,1678',
  annualKwh: '4.190,2',
  declaredWithoutTax: '1.071,15',
  declaredWithTax: '1.362,36',
  fixedPrice: 'no',
  firstRenewal: null,
  separateFromBill: 'yes',
};

function form(change: Values = {}): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = Object.entries({ ...LETTER, ...change })
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `<input name="${name}" value="${value}" />`)
    .join('');
  return el;
}

describe('the renewal form', () => {
  it('reads the Naturgy letter as the engine takes it', () => {
    expect(readRenewalForm(form(), TODAY)).toEqual({ input: naturgy({ firstRenewal: null }) });
  });

  it('takes an energy price for each period', () => {
    const r = readRenewalForm(
      form({
        energyPricing: 'periods',
        currentEnergy: null,
        nextEnergy: null,
        currentEnergyP1: '0,2',
        currentEnergyP2: '0,15',
        currentEnergyP3: '0,1',
        nextEnergyP1: '0,22',
        nextEnergyP2: '0,17',
        nextEnergyP3: '0,12',
      }),
      TODAY,
    );
    if (!('input' in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.input.current.energy).toEqual({ p1: 0.2, p2: 0.15, p3: 0.1 });
    expect(r.input.next.energy).toEqual({ p1: 0.22, p2: 0.17, p3: 0.12 });
  });

  it('leaves out what the letter does not give and what the person does not know', () => {
    const r = readRenewalForm(
      form({
        annualKwh: '',
        declaredWithoutTax: '',
        declaredWithTax: '',
        fixedPrice: 'unknown',
        separateFromBill: 'unknown',
      }),
      TODAY,
    );
    expect(r).toEqual({
      input: naturgy({
        firstRenewal: null,
        annualKwh: null,
        declared: { withoutTax: null, withTax: null },
        fixedPrice: null,
        separateFromBill: null,
      }),
    });
  });

  it('asks for the first renewal only on a fixed price', () => {
    expect(readRenewalForm(form({ fixedPrice: 'yes', firstRenewal: 'yes' }), TODAY)).toEqual({
      input: naturgy({ fixedPrice: true, firstRenewal: true }),
    });
    expect(readRenewalForm(form({ fixedPrice: 'yes' }), TODAY)).toEqual({
      errors: [{ field: 'firstRenewal', code: 'missing_choice' }],
    });
    expect(readRenewalForm(form({ fixedPrice: 'no', firstRenewal: 'yes' }), TODAY)).toEqual({
      input: naturgy({ fixedPrice: false, firstRenewal: null }),
    });
  });

  it('asks for the power and the prices', () => {
    expect(
      readRenewalForm(form({ powerKwP1: '', nextPowerP2: '', currentEnergy: '' }), TODAY),
    ).toEqual({
      errors: [
        { field: 'powerKwP1', code: 'missing_value' },
        { field: 'nextPowerP2', code: 'missing_value' },
        { field: 'currentEnergy', code: 'missing_value' },
      ],
    });
  });

  it('refuses a figure it cannot read', () => {
    expect(readRenewalForm(form({ nextPowerP1: 'doce', powerKwP2: '5.75.1' }), TODAY)).toEqual({
      errors: [
        { field: 'powerKwP2', code: 'invalid_number' },
        { field: 'nextPowerP1', code: 'invalid_number' },
      ],
    });
  });

  it('refuses what the engine bounds, at the question it belongs to', () => {
    expect(
      readRenewalForm(
        form({
          powerKwP1: '20',
          nextPowerP2: '9',
          nextEnergy: '7',
          annualKwh: '900000',
          declaredWithTax: '1000000',
        }),
        TODAY,
      ),
    ).toEqual({
      errors: [
        { field: 'powerKwP1', code: 'power_range' },
        { field: 'nextPowerP2', code: 'price_range' },
        { field: 'nextEnergy', code: 'price_range' },
        { field: 'annualKwh', code: 'kwh_range' },
        { field: 'declaredWithTax', code: 'amount_range' },
      ],
    });
  });

  it('takes the same prices per kW and year, within their own bound', () => {
    expect(
      readRenewalForm(form({ powerUnit: 'per_kw_year', nextPowerP2: '9' }), TODAY),
    ).toMatchObject({
      input: { powerUnit: 'per_kw_year' },
    });
  });

  it('refuses a letter from the future and a renewal before it', () => {
    expect(readRenewalForm(form({ letterDate: '2026-12-01' }), TODAY)).toEqual({
      errors: [{ field: 'letterDate', code: 'in_future' }],
    });
    expect(readRenewalForm(form({ renewalDate: '2026-10-01' }), TODAY)).toEqual({
      errors: [{ field: 'renewalDate', code: 'not_after_start' }],
    });
    expect(readRenewalForm(form({ letterDate: '' }), TODAY)).toEqual({
      errors: [{ field: 'letterDate', code: 'missing_value' }],
    });
  });

  it('checks one sheet at a time', () => {
    const f = form({ powerKwP1: '', annualKwh: 'mucho' });
    expect(sheetErrors(f, 'potencia', TODAY)).toEqual([
      { field: 'powerKwP1', code: 'missing_value' },
    ]);
    expect(sheetErrors(f, 'consumo', TODAY)).toEqual([
      { field: 'annualKwh', code: 'invalid_number' },
    ]);
    expect(sheetErrors(f, 'fechas', TODAY)).toEqual([]);
  });
});

describe('the sheets', () => {
  it('ask every question once, and each question is a trackable field', () => {
    const asked = SHEETS.flatMap((sheet) => SHEET_FIELDS[sheet]);
    expect([...asked].sort()).toEqual([...RENEWAL_FIELDS].sort());
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(sheetOfField(field)).toBe(sheet);
  });
});

describe('a comma followed by three digits', () => {
  it('is a decimal one in a power and in a price, typed', () => {
    const r = readRenewalForm(
      form({
        powerKwP1: '3,464',
        powerKwP2: '3,464',
        powerUnit: 'per_kw_year',
        nextPowerP2: '18,372',
      }),
      TODAY,
    );
    if (!('input' in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.input.powerKw).toEqual({ p1: 3.464, p2: 3.464 });
    expect(r.input.next.power.p2).toBe(18.372);
  });

  it('stays ambiguous in a consumption or an amount', () => {
    expect(readRenewalForm(form({ annualKwh: '1,500' }), TODAY)).toEqual({
      errors: [{ field: 'annualKwh', code: 'invalid_number' }],
    });
  });

  it('survives a read of a per kW and year letter, filled in and reviewed', () => {
    const field = (value: string | number | boolean) => ({
      value,
      confidence: 'high' as const,
      source: 'price_change_notice' as const,
    });
    const extraction: RenewalExtraction = {
      pages: [],
      documents: [],
      conflicts: [],
      fields: {
        letterDate: field('2026-10-31'),
        renewalDate: field('2026-12-10'),
        powerKwP1: field(3.464),
        powerKwP2: field(3.464),
        powerUnit: field('per_kw_year'),
        currentPowerP1: field(30.817),
        currentPowerP2: field(0.725),
        nextPowerP1: field(40.25),
        nextPowerP2: field(18.372),
        currentEnergy: field(0.144972),
        nextEnergy: field(0.1678),
        annualKwh: field(4190.2),
        fixedPrice: field(false),
        separateFromBill: field(true),
      },
    };
    const entries = Object.fromEntries(renewalPrefill(extraction, pageTranslator('bills')).entries);
    expect(entries['powerKwP1']).toBe('3,464');
    expect(entries['nextPowerP2']).toBe('18,372');
    const r = readRenewalForm(form(entries), TODAY);
    if (!('input' in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.input).toMatchObject({
      powerKw: { p1: 3.464, p2: 3.464 },
      powerUnit: 'per_kw_year',
      current: { power: { p1: 30.817, p2: 0.725 } },
      next: { power: { p1: 40.25, p2: 18.372 } },
    });
  });
});
