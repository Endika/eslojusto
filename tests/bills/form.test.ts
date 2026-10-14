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
import { applies as telecomApplies } from '../../src/bills/telecom/conditions';
import { readTelecomForm } from '../../src/bills/telecom/form';
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

  it('takes a free-market bill as from another retailer, with its services and a refund', () => {
    const r = readElectricityForm(
      form(BILL, {
        market: 'free',
        retailer: null,
        serviceCount: '2',
        serviceLabel1: 'maintenance',
        serviceAmount1: '5,00',
        serviceRequested1: 'no',
        serviceLabel2: 'insurance',
        serviceAmount2: '3,00',
        serviceRequested2: 'unknown',
        regularization: 'returned',
        regularizationAmount: '4,00',
      }),
      TODAY,
    );
    expect(r).toMatchObject({
      input: {
        market: 'free',
        retailer: 'other',
        services: [
          { label: 'maintenance', amount: 5, requested: 'no' },
          { label: 'insurance', amount: 3, requested: 'unknown' },
        ],
        regularizations: [-4],
      },
    });
  });

  it('reads «No lo sé» as an open answer, never as a choice', () => {
    const r = readElectricityForm(
      form(BILL, { holder: 'unknown', meterPhase: 'unknown', meterOwned: 'unknown' }),
      TODAY,
    );
    expect(r).toMatchObject({
      input: { holder: null, meter: { phase: null, owned: null } },
    });
  });

  it('keeps each missing or unreadable answer on its question', () => {
    expect(readElectricityForm(form(BILL, { total: '', kwhP2: 'mucho' }), TODAY)).toEqual({
      errors: [
        { field: 'kwhP2', code: 'invalid_number' },
        { field: 'total', code: 'missing_value' },
      ],
    });
    expect(sheetErrors(form(BILL, { total: '' }), 'total', TODAY)).toEqual([
      { field: 'total', code: 'missing_value' },
    ]);
    expect(sheetErrors(form(BILL, { total: '' }), 'suministro', TODAY)).toEqual([]);
  });

  it('puts the engine’s checks on the sheet that asks them', () => {
    expect(sheetErrors(form(BILL, { readingTo: '2026-05-20' }), 'lecturas', TODAY)).toEqual([
      { field: 'readingTo', code: 'not_after_start' },
    ]);
    expect(sheetOfField('readingTo')).toBe('lecturas');
  });

  it.each([
    [{ postcode: '35001' }, 'canary_ceuta_melilla'],
    [{ accessTariff: 'other' }, 'not_2_0td'],
    [{ powerP1: '15,01' }, 'over_15kw'],
    [{ issuedOn: '2026-06-11' }, 'issued_before_2026_06_12'],
    [{ selfConsumption: 'with_surplus' }, 'self_consumption_surplus'],
  ])('stops %j at the gate as %s', (change, reason) => {
    expect(formScope(form(BILL, change))).toEqual({ inScope: false, reason });
  });

  it('stops a Canary postcode on the first sheet, before anything else is answered', () => {
    const el = form({ postcode: '38001', accessTariff: '2.0TD' });
    expect(formScope(el)).toEqual({ inScope: false, reason: 'canary_ceuta_melilla' });
    expect(electricityApplies(el, 'autoconsumo')).toBe(false);
    expect(electricityApplies(el, 'resultado')).toBe(true);
  });

  it('asks a bill issued on 12-06-2026 the rest of its sheets', () => {
    expect(formScope(form(BILL, { issuedOn: '2026-06-12' }))).toEqual({ inScope: true });
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

  it('asks a second service only when there are two', () => {
    expect(electricityApplies(radios({ serviceCount: '1' }), 'servicio-1')).toBe(true);
    expect(electricityApplies(radios({ serviceCount: '1' }), 'servicio-2')).toBe(false);
    expect(electricityApplies(radios({ serviceCount: '0' }), 'servicio-1')).toBe(false);
  });

  it('asks about the meter and the penalty only when the bill charges them', () => {
    expect(electricityApplies(radios({ meterCharged: 'no' }), 'contador-tipo')).toBe(false);
    expect(electricityApplies(radios({ hasPenalty: 'yes' }), 'penalizacion-contrato')).toBe(true);
    expect(electricityApplies(radios({ hasBonus: 'no' }), 'bono-social-consumo')).toBe(false);
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
  it('reads a commitment left after 12 of its 18 months', () => {
    expect(readTelecomForm(form(EXIT), TODAY)).toEqual({
      input: {
        commitment: { startedOn: parseDate('2025-03-01'), months: 18, agreedPenalty: 180 },
        exitRequestedOn: parseDate('2026-03-01'),
        penaltyCharged: 120,
        handset: null,
        changeNotice: null,
        lines: [],
      },
    });
  });

  it('leaves the agreed penalty open when the person does not know it', () => {
    expect(readTelecomForm(form(EXIT, { agreedPenalty: '' }), TODAY)).toMatchObject({
      input: { commitment: { agreedPenalty: null } },
    });
  });

  it('reads a price rise notified, the handset kept and a period billed after the exit', () => {
    const r = readTelecomForm(
      form(EXIT, {
        change: 'notice',
        sentOn: '2026-02-10',
        appliesOn: '',
        changeKind: 'price_up',
        priceIndex: 'none',
        hasHandset: 'yes',
        handsetValue: '300',
        handsetKept: 'yes',
        chargedAfter: 'yes',
        lineFrom: '2026-03-01',
        lineTo: '2026-03-31',
        lineAmount: '31',
      }),
      TODAY,
    );
    expect(r).toMatchObject({
      input: {
        changeNotice: {
          sentOn: parseDate('2026-02-10'),
          appliesOn: null,
          change: 'price_up',
          index: 'none',
        },
        handset: { value: 300, kept: true },
        lines: [{ from: parseDate('2026-03-01'), to: parseDate('2026-03-31'), amount: 31 }],
      },
    });
  });

  it('asks what changed and the handset only when the conditions changed', () => {
    const el = form(EXIT);
    el.innerHTML += '<input type="radio" name="change" value="none" checked />';
    expect(telecomApplies(el, 'cambio')).toBe(false);
    expect(telecomApplies(el, 'terminal')).toBe(false);
    expect(telecomApplies(el, 'cobros')).toBe(true);
  });

  it('stops an exit before 2022 at the gate', () => {
    const el = form(EXIT, { exitRequestedOn: '2021-12-31', startedOn: '2021-01-01' });
    el.innerHTML += '<input type="radio" name="hasCommitment" value="yes" checked />';
    expect(telecomApplies(el, 'aviso')).toBe(false);
    expect(telecomApplies(el, 'baja')).toBe(true);
  });
});
