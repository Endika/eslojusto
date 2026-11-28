// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { applies as electricityApplies } from '../../src/bills/electricity/conditions';
import {
  formScope,
  readElectricityForm,
  sheetErrors,
  sheetOfField,
} from '../../src/bills/electricity/form';
import { ELECTRICITY_FLOW } from '../../src/bills/electricity/steps';
import { applies as telecomApplies } from '../../src/bills/telecom/conditions';
import { TELECOM_FLOW } from '../../src/bills/telecom/steps';
import { juneBill, meter } from '../engine/bills/input';

const TODAY = parseDate('2026-10-13');

type Values = Readonly<Record<string, string | null>>;

// The June PVPC bill of the engine's tests, as the form asks it; tests change what they check. A
// null value leaves the question out, as a hidden question is.
const BILL: Values = {
  postcode: '28001',
  accessTariff: '2.0TD',
  selfConsumption: 'none',
  powerP1: '4,6',
  powerP2: '4,6',
  issuedOn: '2026-07-02',
  dueOn: '2026-07-07',
  readingFrom: '2026-05-31',
  readingTo: '2026-06-30',
  billedDays: '30',
  market: 'pvpc',
  retailer: 'reference',
  holder: 'person',
  powerUnit: 'per_kw_year',
  priceChange: 'no',
  powerPriceP1: '30,817413',
  powerAmountP1: '11,65',
  powerPriceP2: '0,725423',
  powerAmountP2: '0,27',
  maxUsedP1: '3,1',
  maxUsedP2: '1,2',
  energyPricing: 'periods',
  kwhP1: '60',
  energyPriceP1: '0,20',
  energyAmountP1: '12,00',
  kwhP2: '70',
  energyPriceP2: '0,15',
  energyAmountP2: '10,50',
  kwhP3: '120',
  energyPriceP3: '0,10',
  energyAmountP3: '12,00',
  tollsShown: 'yes',
  tollsPower: '10,75',
  tollsEnergy: '8,30',
  fundingShown: 'yes',
  funding: '0,60',
  hasBonus: 'no',
  meterCharged: 'yes',
  meterAmount: '0,80',
  meterPhase: 'single',
  meterOwned: 'no',
  serviceCount: '0',
  hasExcess: 'no',
  hasPenalty: 'no',
  discount: '',
  regularization: 'none',
  taxAmount: '2,40',
  taxPercent: '5,11269632',
  vatAmount: '10,55',
  vatPercent: '21',
  total: '60,77',
};

function form(values: Values, change: Values = {}): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = Object.entries({ ...values, ...change })
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `<input name="${name}" value="${value}" />`)
    .join('');
  return el;
}

describe('the electricity form', () => {
  it('reads the June bill as the engine takes it', () => {
    const r = readElectricityForm(form(BILL), TODAY);
    expect(r).toEqual({
      input: juneBill({
        electricityTax: { base: null, percent: 5.11269632, amount: 2.4 },
        vat: { base: null, percent: 21, amount: 10.55 },
        readingKind: null,
        // The form asks the meter billed, not the supply's own phase.
        meter: meter({ supplyPhase: null }),
      }),
    });
  });

  it('takes one line for all the energy when the bill charges it at one price', () => {
    const r = readElectricityForm(
      form(BILL, {
        energyPricing: 'single',
        kwhAll: '250',
        energyPriceAll: '0,138',
        energyAmountAll: '34,50',
      }),
      TODAY,
    );
    if (!('input' in r)) throw new Error(JSON.stringify(r.errors));
    expect(r.input.energy).toEqual([{ period: 'all', kwh: 250, price: 0.138, amount: 34.5 }]);
  });

  it('puts the engine’s checks on the sheet that asks them', () => {
    expect(sheetErrors(form(BILL, { readingTo: '2026-05-20' }), 'lecturas', TODAY)).toEqual([
      { field: 'readingTo', code: 'not_after_start' },
    ]);
    expect(sheetOfField('readingTo')).toBe('lecturas');
  });

  it('stops a Canary postcode on the first sheet, before anything else is answered', () => {
    const el = form({ postcode: '38001', accessTariff: '2.0TD' });
    expect(formScope(el)).toEqual({ inScope: false, reason: 'canary_ceuta_melilla' });
    expect(electricityApplies(el, 'autoconsumo')).toBe(false);
    expect(electricityApplies(el, 'resultado')).toBe(true);
    expect(electricityApplies(el, 'suministro')).toBe(true);
  });

  it('asks a sheet with no condition of a bill within the review', () => {
    expect(electricityApplies(form(BILL), 'autoconsumo')).toBe(true);
  });
});

describe('the electricity sheets', () => {
  // The radios a sheet's condition reads, as the page has them.
  function radios(values: Values): HTMLFormElement {
    const el = document.createElement('form');
    el.innerHTML = Object.entries(values)
      .map(([name, value]) => `<input type="radio" name="${name}" value="${value}" checked />`)
      .join('');
    return el;
  }

  it('asks about the meter and the penalty only when the bill charges them', () => {
    expect(electricityApplies(radios({ meterCharged: 'no' }), 'contador-tipo')).toBe(false);
    expect(electricityApplies(radios({ hasPenalty: 'yes' }), 'penalizacion-contrato')).toBe(true);
    expect(electricityApplies(radios({ hasBonus: 'no' }), 'bono-social-consumo')).toBe(false);
  });
});

describe('the electricity flow', () => {
  it('completes a sheet when it has no error, and the result always', () => {
    const empty = document.createElement('form');
    expect(ELECTRICITY_FLOW.complete(form(BILL), 'suministro', TODAY)).toBe(true);
    expect(ELECTRICITY_FLOW.complete(empty, 'suministro', TODAY)).toBe(false);
    expect(ELECTRICITY_FLOW.complete(empty, 'resultado', TODAY)).toBe(true);
  });
});

const EXIT: Values = {
  hasCommitment: 'yes',
  startedOn: '2025-03-01',
  months: '18',
  agreedPenalty: '180',
  exitRequestedOn: '2026-03-01',
  change: 'none',
  penaltyCharged: '120',
  chargedAfter: 'no',
};

describe('the telecom form', () => {
  it('asks what changed and the handset only when the conditions changed', () => {
    const el = form(EXIT);
    el.innerHTML += '<input type="radio" name="change" value="none" checked />';
    expect(telecomApplies(el, 'cambio')).toBe(false);
    expect(telecomApplies(el, 'terminal')).toBe(false);
    expect(telecomApplies(el, 'cobros')).toBe(true);
  });

  it('asks the sheets of a commitment and of the exit even when the exit is outside the review', () => {
    const el = form(EXIT, { exitRequestedOn: '2021-12-31', startedOn: '2021-01-01' });
    el.innerHTML += '<input type="radio" name="hasCommitment" value="no" checked />';
    expect(telecomApplies(el, 'permanencia')).toBe(true);
    expect(telecomApplies(el, 'resultado')).toBe(true);
    expect(telecomApplies(el, 'baja')).toBe(true);
    expect(telecomApplies(el, 'penalizacion')).toBe(false);
    expect(telecomApplies(el, 'cobros')).toBe(false);
  });

  it('asks the agreed penalty only of a commitment', () => {
    const answered = (value: string) => {
      const el = document.createElement('form');
      el.innerHTML = `<input type="radio" name="hasCommitment" value="${value}" checked />`;
      return el;
    };
    expect(telecomApplies(answered('yes'), 'penalizacion')).toBe(true);
    expect(telecomApplies(answered('no'), 'penalizacion')).toBe(false);
    expect(telecomApplies(document.createElement('form'), 'penalizacion')).toBe(false);
  });

  it('asks what changed and the handset whenever the conditions changed, noticed or not', () => {
    for (const change of ['notice', 'no_notice']) {
      const el = form(EXIT);
      el.innerHTML += `<input type="radio" name="change" value="${change}" checked />`;
      expect(telecomApplies(el, 'cambio')).toBe(true);
      expect(telecomApplies(el, 'terminal')).toBe(true);
    }
  });
});

describe('the telecom flow', () => {
  it('completes a sheet when it has no error, and the result always', () => {
    const empty = document.createElement('form');
    expect(TELECOM_FLOW.complete(form(EXIT), 'baja', TODAY)).toBe(true);
    expect(TELECOM_FLOW.complete(empty, 'baja', TODAY)).toBe(false);
    expect(TELECOM_FLOW.complete(empty, 'resultado', TODAY)).toBe(true);
  });
});
