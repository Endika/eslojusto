import { describe, expect, it } from 'vitest';
import { electricityPrefill } from '../../../src/bills/electricity/prefill';
import type {
  Confidence,
  ElectricityExtraction,
  ExtractedRow,
  ExtractedValue,
} from '../../../src/documents/contract';
import type { Translate } from '../../../src/i18n/client';

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

const row = (values: Record<string, ExtractedValue>, confidence: Confidence = 'high') => ({
  values,
  confidence,
});

const extraction = (e: Partial<ElectricityExtraction>): ElectricityExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  bills: [row({ document: 1 })],
  powerLines: [],
  energyLines: [],
  otherLines: [],
  agreedPrices: [],
  services: [],
  priceChanges: [],
  ...e,
});

const billOf = (values: Record<string, ExtractedValue>, e: Partial<ElectricityExtraction> = {}) =>
  extraction({ bills: [row({ document: 1, ...values }, 'medium')], ...e });

const entriesOf = (e: ElectricityExtraction) => electricityPrefill(e, tr).bills[0]?.entries;
const marksOf = (e: ElectricityExtraction) =>
  Object.fromEntries(
    (electricityPrefill(e, tr).bills[0]?.marks ?? []).map((m) => [m.id, m.confidence]),
  );

const line = (
  document: number,
  kind: string,
  extra: Record<string, ExtractedValue>,
  c?: Confidence,
) => row({ document, kind, ...extra }, c);

describe('the answers a bill gives', () => {
  it('fills every answer a bill states, marked with the bill’s confidence', () => {
    const e = billOf(
      {
        postcode: '28001',
        accessTariff: '3.0TD',
        selfConsumption: 'with_surplus',
        contractedPowerP1: 4.6,
        contractedPowerP2: 5.75,
        issuedOn: '2026-07-02',
        dueOn: '2026-07-07',
        readingFrom: '2026-05-31',
        readingTo: '2026-06-30',
        billedDays: 30,
        market: 'free',
        maxPowerUsedP1: 3.1,
        maxPowerUsedP2: 1.2,
        tollsAndChargesPower: 10.75,
        tollsAndChargesEnergy: 8.3,
        socialBonusFunding: 0.6,
        socialBonusAmount: 5.5,
        socialBonusCategory: 'severe',
        socialBonusKwh: 120,
        meterAmount: 0.8,
        meterPhase: 'three',
        excessPowerAmount: 3,
        exitPenaltyAmount: 20,
        electricityTaxAmount: 2.4,
        electricityTaxPercent: 5.11269632,
        vatAmount: 10.55,
        vatPercent: 21,
        total: 60.77,
      },
      {
        fields: {
          priceType: { value: 'variable', confidence: 'low', source: 'electricity_contract' },
        },
      },
    );
    expect(entriesOf(e)).toEqual([
      ['postcode', '28001'],
      ['accessTariff', 'other'],
      ['selfConsumption', 'with_surplus'],
      ['powerP1', '4,6'],
      ['powerP2', '5,75'],
      ['issuedOn', '2026-07-02'],
      ['dueOn', '2026-07-07'],
      ['readingFrom', '2026-05-31'],
      ['readingTo', '2026-06-30'],
      ['billedDays', '30'],
      ['market', 'free'],
      ['maxUsedP1', '3,1'],
      ['maxUsedP2', '1,2'],
      ['tollsShown', 'yes'],
      ['tollsPower', '10,75'],
      ['tollsEnergy', '8,30'],
      ['fundingShown', 'yes'],
      ['funding', '0,60'],
      ['hasBonus', 'yes'],
      ['bonusCategory', 'severe'],
      ['bonusAmount', '5,50'],
      ['bonusDiscountedKwh', '120'],
      ['meterCharged', 'yes'],
      ['meterAmount', '0,80'],
      ['meterPhase', 'three'],
      ['hasExcess', 'yes'],
      ['excessAmount', '3,00'],
      ['hasPenalty', 'yes'],
      ['penaltyAmount', '20,00'],
      ['priceType', 'variable'],
      ['taxAmount', '2,40'],
      ['taxPercent', '5,11269632'],
      ['vatAmount', '10,55'],
      ['vatPercent', '21'],
      ['total', '60,77'],
    ]);
    const marks = marksOf(e);
    expect(marks['postcode']).toBe('medium');
    expect(marks['priceType']).toBe('low');
    expect(marks['tollsShown']).toBeUndefined();
    const [bill] = electricityPrefill(e, tr).bills;
    expect(bill?.notes).toEqual(['client.documents.done_low']);
    expect(bill?.lowConfidence).toBe(true);
    expect(bill?.count).toBe(bill?.marks.length);
  });

  it('leaves out what a bill states in a way the form cannot take', () => {
    const e = billOf({
      postcode: 28001,
      accessTariff: 'x',
      selfConsumption: 'x',
      contractedPowerP1: -1,
      contractedPowerP2: Number.POSITIVE_INFINITY,
      issuedOn: 'not a date',
      dueOn: 7,
      billedDays: 30.5,
      market: 'x',
      maxPowerUsedP1: '3',
      tollsAndChargesPower: 10,
      socialBonusFunding: -0.6,
      socialBonusCategory: 'x',
      meterPhase: 'three',
      excessPowerAmount: null as never,
      vatPercent: '21',
    });
    expect(entriesOf(e)).toEqual([]);
    const [bill] = electricityPrefill(e, tr).bills;
    expect(bill?.notes).toEqual([]);
    expect(bill?.lowConfidence).toBe(false);
    expect(bill?.fingerprint).toBeNull();
  });

  it('reads a 2.0TD tariff as it is, and any other as another', () => {
    expect(entriesOf(billOf({ accessTariff: '2.0TD' }))).toEqual([['accessTariff', '2.0TD']]);
    expect(entriesOf(billOf({ accessTariff: 'other' }))).toEqual([['accessTariff', 'other']]);
  });

  it('opens the tolls only when the bill gives both of them', () => {
    expect(entriesOf(billOf({ tollsAndChargesEnergy: 10 }))).toEqual([]);
  });

  it('is not low in confidence when no answer is', () => {
    const [bill] = electricityPrefill(billOf({ postcode: '28001' }), tr).bills;
    expect(bill).toMatchObject({ lowConfidence: false, notes: [] });
  });

  it('reads a postcode of exactly five digits, and a figure of zero', () => {
    expect(entriesOf(billOf({ postcode: '280010' }))).toEqual([]);
    expect(entriesOf(billOf({ postcode: 'x28001' }))).toEqual([]);
    expect(entriesOf(billOf({ postcode: '28001', meterAmount: 0 }))).toEqual([
      ['postcode', '28001'],
      ['meterCharged', 'yes'],
      ['meterAmount', '0,00'],
    ]);
  });

  it('opens a question without a figure when the bill gives the amount but not the rest', () => {
    expect(entriesOf(billOf({ tollsAndChargesPower: 1, socialBonusAmount: 'x' }))).toEqual([]);
    expect(entriesOf(billOf({ socialBonusAmount: 4 }))).toEqual([
      ['hasBonus', 'yes'],
      ['bonusAmount', '4,00'],
    ]);
    expect(entriesOf(billOf({ exitPenaltyAmount: 4 }))).toEqual([
      ['hasPenalty', 'yes'],
      ['penaltyAmount', '4,00'],
    ]);
  });

  it('takes the price type of a penalty only from a contract that states one the form knows', () => {
    const penalty = { exitPenaltyAmount: 4 };
    const contract = (value: ExtractedValue) => ({
      fields: {
        priceType: { value, confidence: 'high' as const, source: 'electricity_contract' as const },
      },
    });
    expect(entriesOf(billOf(penalty, contract('x')))).not.toContainEqual(['priceType', 'x']);
    expect(marksOf(billOf(penalty, contract('x')))['priceType']).toBeUndefined();
    expect(marksOf(billOf(penalty, contract('fixed')))['priceType']).toBe('high');
    expect(marksOf(billOf({}, contract('fixed')))['priceType']).toBeUndefined();
  });

  it('keeps the fingerprint and the readings of the bill', () => {
    const [bill] = electricityPrefill(
      billOf({ supplyFingerprint: 'abc', readingFrom: '2026-05-31', readingTo: '2026-06-30' }),
      tr,
    ).bills;
    expect(bill).toMatchObject({ fingerprint: 'abc', from: '2026-05-31', to: '2026-06-30' });
  });
});

describe('the lines of a bill', () => {
  const power = (
    document: number,
    period: string,
    extra: Record<string, ExtractedValue> = {},
    c?: Confidence,
  ) => row({ document, period, kw: 4.6, price: 0.5, unit: 'per_kw_day', amount: 1, ...extra }, c);
  const energy = (
    document: number,
    period: string,
    extra: Record<string, ExtractedValue> = {},
    c?: Confidence,
  ) => row({ document, period, kwh: 10, price: 0.25, amount: 2.5, ...extra }, c);

  it('reads one line a period, in the unit they all share, as the least sure of them', () => {
    const e = billOf(
      {},
      {
        powerLines: [power(1, 'p1', {}, 'high'), power(1, 'p2', { price: 0.75, amount: 2 }, 'low')],
        energyLines: [energy(1, 'p1'), energy(1, 'p3', { kwh: 5.5 }, 'medium'), energy(2, 'p2')],
      },
    );
    expect(entriesOf(e)).toEqual([
      ['priceChange', 'no'],
      ['powerUnit', 'per_kw_day'],
      ['powerPriceP1', '0,5'],
      ['powerAmountP1', '1,00'],
      ['powerPriceP2', '0,75'],
      ['powerAmountP2', '2,00'],
      ['energyPricing', 'periods'],
      ['kwhP1', '10'],
      ['energyPriceP1', '0,25'],
      ['energyAmountP1', '2,50'],
      ['kwhP3', '5,5'],
      ['energyPriceP3', '0,25'],
      ['energyAmountP3', '2,50'],
    ]);
    expect(electricityPrefill(e, tr).bills[0]?.marks[0]).toMatchObject({
      id: 'priceChange',
      derived: true,
    });
    expect(marksOf(e)).toMatchObject({
      priceChange: 'low',
      powerUnit: 'low',
      powerPriceP1: 'high',
      powerPriceP2: 'low',
      energyPricing: 'medium',
      kwhP1: 'high',
      kwhP3: 'medium',
    });
  });

  it('asks the price change from a bill with only power lines, or only energy lines', () => {
    expect(entriesOf(billOf({}, { powerLines: [power(1, 'p1')] }))?.[0]).toEqual([
      'priceChange',
      'no',
    ]);
    expect(entriesOf(billOf({}, { energyLines: [energy(1, 'p1')] }))?.[0]).toEqual([
      'priceChange',
      'no',
    ]);
    expect(entriesOf(billOf({}, {}))).toEqual([]);
  });

  it('leaves the lines to the person when a period is billed in stretches', () => {
    const stretchedPower = billOf({}, { powerLines: [power(1, 'p1'), power(1, 'p1')] });
    expect(entriesOf(stretchedPower)).toEqual([['priceChange', 'yes']]);
    const stretchedEnergy = billOf({}, { energyLines: [energy(1, 'p2'), energy(1, 'p2')] });
    expect(entriesOf(stretchedEnergy)).toEqual([['priceChange', 'yes']]);
    const oneEach = billOf({}, { powerLines: [power(1, 'p1'), power(1, 'p2')] });
    expect(entriesOf(oneEach)).toContainEqual(['priceChange', 'no']);
  });

  it('leaves the unit to the person when the lines state two, or none the form knows', () => {
    const two = billOf(
      {},
      { powerLines: [power(1, 'p1'), power(1, 'p2', { unit: 'per_kw_year' })] },
    );
    expect(entriesOf(two)?.map(([name]) => name)).not.toContain('powerUnit');
    const unknown = billOf({}, { powerLines: [power(1, 'p1', { unit: 'x' })] });
    expect(entriesOf(unknown)?.map(([name]) => name)).not.toContain('powerUnit');
  });

  it('reads one line for all the energy as a single price, only when no line is of a period', () => {
    const single = billOf(
      {},
      {
        energyLines: [energy(1, 'all', { kwh: 300 }, 'low')],
      },
    );
    expect(entriesOf(single)).toEqual([
      ['priceChange', 'no'],
      ['energyPricing', 'single'],
      ['kwhAll', '300'],
      ['energyPriceAll', '0,25'],
      ['energyAmountAll', '2,50'],
    ]);
    const mixed = billOf({}, { energyLines: [energy(1, 'all'), energy(1, 'p1')] });
    expect(entriesOf(mixed)).toContainEqual(['energyPricing', 'periods']);
    expect(entriesOf(mixed)?.map(([name]) => name)).not.toContain('kwhAll');
  });
});

describe('the services, discounts and regularisations of a bill', () => {
  const other = (rows: ExtractedRow[]) => ({
    otherLines: rows.map((r) => ({ ...r, values: { document: 1, ...r.values } })),
  });
  const service = (extra: Record<string, ExtractedValue>, c?: Confidence) =>
    line(1, 'service', { serviceLabel: 'pack', amount: 3, ...extra }, c);

  it('takes the first two services, each as sure as medium at best, and says how many there were', () => {
    const e = billOf(
      {},
      other([
        service({ serviceLabel: 'insurance' }, 'high'),
        service({ serviceLabel: 'x', amount: 4.5 }, 'low'),
        service({}),
      ]),
    );
    expect(entriesOf(e)).toEqual([
      ['serviceCount', '2'],
      ['serviceLabel1', 'insurance'],
      ['serviceAmount1', '3,00'],
      ['serviceLabel2', 'other'],
      ['serviceAmount2', '4,50'],
    ]);
    expect(marksOf(e)).toMatchObject({
      serviceCount: 'low',
      serviceLabel1: 'medium',
      serviceAmount1: 'high',
      serviceLabel2: 'low',
    });
    expect(electricityPrefill(e, tr).notes).toEqual([
      'client.bills.documents.more_services {"n":3}',
    ]);
  });

  it('says nothing of the services when there are two or fewer', () => {
    const e = billOf({}, other([service({}), service({})]));
    expect(electricityPrefill(e, tr).notes).toEqual([]);
    expect(entriesOf(e)?.[0]).toEqual(['serviceCount', '2']);
  });

  it('adds the discounts up, derived when there are several', () => {
    const one = billOf({}, other([line(1, 'discount', { amount: 1.5 }, 'low')]));
    expect(entriesOf(one)).toEqual([['discount', '1,50']]);
    expect(electricityPrefill(one, tr).bills[0]?.marks).toEqual([
      { id: 'discount', container: '[data-field="discount"]', confidence: 'low' },
    ]);
    const two = billOf(
      {},
      other([line(1, 'discount', { amount: 1.5 }), line(1, 'discount', { amount: 2 })]),
    );
    expect(entriesOf(two)).toEqual([['discount', '3,50']]);
    expect(electricityPrefill(two, tr).bills[0]?.marks[0]).toMatchObject({ derived: true });
  });

  it('reads a regularisation charged or returned, derived when there are several', () => {
    const charged = billOf({}, other([line(1, 'regularization_charge', { amount: 5 }, 'low')]));
    expect(entriesOf(charged)).toEqual([
      ['regularization', 'charged'],
      ['regularizationAmount', '5,00'],
    ]);
    expect(marksOf(charged)).toEqual({ regularization: 'low', regularizationAmount: 'low' });
    expect(electricityPrefill(charged, tr).bills[0]?.marks.map((m) => m.derived)).toEqual([
      undefined,
      undefined,
    ]);
    const returned = billOf(
      {},
      other([
        line(1, 'regularization_refund', { amount: 5 }),
        line(1, 'regularization_refund', { amount: 1 }),
      ]),
    );
    expect(entriesOf(returned)).toEqual([
      ['regularization', 'returned'],
      ['regularizationAmount', '6,00'],
    ]);
    const marks = electricityPrefill(returned, tr).bills[0]?.marks;
    expect(marks?.[0]?.derived).toBeUndefined();
    expect(marks?.[1]?.derived).toBe(true);
  });

  it('leaves both regularisations to the person, saying so', () => {
    const both = billOf(
      {},
      other([
        line(1, 'regularization_charge', { amount: 5 }),
        line(1, 'regularization_refund', { amount: 1 }),
      ]),
    );
    expect(entriesOf(both)).toEqual([]);
    expect(electricityPrefill(both, tr).notes).toEqual([
      'client.bills.documents.both_regularizations',
    ]);
  });

  it('reads nothing of lines of another bill or of another kind', () => {
    const e = billOf(
      {},
      {
        otherLines: [line(2, 'discount', { amount: 1 }), line(1, 'something', { amount: 1 })],
      },
    );
    expect(entriesOf(e)).toEqual([]);
  });
});

describe('a read of several bills', () => {
  it('orders the bills by their last reading, those without one last', () => {
    const e = extraction({
      bills: [
        row({ document: 1 }),
        row({ document: 2, readingTo: '2026-08-30' }),
        row({ document: 3, readingTo: '2026-06-30' }),
        row({ document: 4 }),
        row({ document: 5, readingTo: '2026-07-30' }),
      ],
    });
    expect(electricityPrefill(e, tr).bills.map((b) => b.to)).toEqual([
      '2026-06-30',
      '2026-07-30',
      '2026-08-30',
      null,
      null,
    ]);
  });

  it('keeps the order read of bills without a last reading', () => {
    const bills = [1, 2, 3].map((n) => row({ document: n, supplyFingerprint: `fp${n}` }));
    expect(electricityPrefill(extraction({ bills }), tr).bills.map((b) => b.fingerprint)).toEqual([
      'fp1',
      'fp2',
      'fp3',
    ]);
  });

  it('puts a bill without a last reading after one with it, whichever is first', () => {
    const dated = row({ document: 1, readingTo: '2026-06-30' });
    const open = row({ document: 2 });
    for (const bills of [
      [dated, open],
      [open, dated],
    ]) {
      expect(electricityPrefill(extraction({ bills }), tr).bills.map((b) => b.to)).toEqual([
        '2026-06-30',
        null,
      ]);
    }
  });

  it('counts the bills, then what was cut off, then the checks that failed, once each', () => {
    const e = extraction({
      bills: [row({ document: 1 }), row({ document: 2 })],
      truncated: true,
      otherLines: [
        line(1, 'regularization_charge', {}),
        line(1, 'regularization_refund', {}),
        line(2, 'regularization_charge', {}),
        line(2, 'regularization_refund', {}),
      ],
    });
    expect(electricityPrefill(e, tr, ['duplicate_bill', 'days_mismatch']).notes).toEqual([
      'client.bills.documents.several {"n":2}',
      'client.bills.documents.both_regularizations',
      'client.bills.documents.truncated',
      'client.bills.documents.check.days_mismatch',
      'client.bills.documents.check.duplicate_bill',
    ]);
  });

  it('says nothing of the count for one bill, nor of checks that did not fail', () => {
    expect(electricityPrefill(extraction({}), tr).notes).toEqual([]);
    expect(electricityPrefill(extraction({}), tr, []).notes).toEqual([]);
  });
});
