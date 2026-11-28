import { describe, expect, it } from 'vitest';
import { applies } from '../../src/bills/renewal/conditions';
import { renewalPrefill } from '../../src/bills/renewal/prefill';
import { renewalReading } from '../../src/bills/renewal/reading';
import type { RenewalExtraction, SourcedField } from '../../src/documents/contract';
import type { Translate } from '../../src/i18n/client';
import { pageTranslator } from '../support/page-strings';

const tr = pageTranslator('bills');

const field = (value: SourcedField['value'], confidence: SourcedField['confidence'] = 'high') => ({
  value,
  confidence,
  source: 'price_change_notice' as const,
});

function read(
  fields: RenewalExtraction['fields'],
  extra: Partial<RenewalExtraction> = {},
): RenewalExtraction {
  return { pages: [], documents: [], fields, conflicts: [], ...extra };
}

describe('what a read of the renewal letter fills in', () => {
  const letter = read({
    letterDate: field('2026-10-31'),
    renewalDate: field('2026-12-10'),
    powerKwP1: field(5.75),
    powerKwP2: field(5.75),
    powerUnit: field('per_kw_day'),
    currentPowerP1: field(0.110283),
    nextPowerP1: field(0.12303),
    currentEnergy: field(0.144972),
    nextEnergy: field(0.1678),
    annualKwh: field(4190.2),
    declaredWithoutTax: field(1071.15, 'medium'),
    separateFromBill: field(true),
    fixedPrice: field(false),
    isRenewal: field(true),
  });

  it('gives the form its own strings', () => {
    const p = renewalPrefill(letter, tr);
    expect(Object.fromEntries(p.entries)).toEqual({
      letterDate: '2026-10-31',
      renewalDate: '2026-12-10',
      powerKwP1: '5,75',
      powerKwP2: '5,75',
      powerUnit: 'per_kw_day',
      currentPowerP1: '0,110283',
      nextPowerP1: '0,12303',
      currentEnergy: '0,144972',
      nextEnergy: '0,1678',
      annualKwh: '4190,2',
      declaredWithoutTax: '1.071,15',
      separateFromBill: 'yes',
      currentEnergyPricing: 'single',
      nextEnergyPricing: 'single',
    });
    expect(p.count).toBe(12);
    expect(p.lowConfidence).toBe(false);
    expect(p.marks.find((m) => m.id === 'declaredWithoutTax')).toMatchObject({
      container: '[data-field="declaredWithoutTax"]',
      confidence: 'medium',
    });
  });

  it('opens the prices by period when the letter gives them so', () => {
    const p = renewalPrefill(
      read({ currentEnergyP1: field(0.2), nextEnergyP3: field(0.12, 'low') }),
      tr,
    );
    expect(Object.fromEntries(p.entries)).toMatchObject({
      currentEnergyP1: '0,20',
      nextEnergyP3: '0,12',
      currentEnergyPricing: 'periods',
      nextEnergyPricing: 'periods',
    });
    expect(p.lowConfidence).toBe(true);
  });

  it('opens each side as the letter writes it, one price becoming three', () => {
    const p = Object.fromEntries(
      renewalPrefill(
        read({
          currentEnergy: field(0.144972),
          nextEnergyP1: field(0.22),
          nextEnergyP2: field(0.17),
          nextEnergyP3: field(0.12),
        }),
        tr,
      ).entries,
    );
    expect(p).toMatchObject({ currentEnergyPricing: 'single', nextEnergyPricing: 'periods' });
  });

  it('leaves out the fixed price, which the review no longer asks', () => {
    expect(renewalPrefill(read({ fixedPrice: field(true) }), tr).entries).toEqual([]);
  });

  it('leaves out what it cannot read', () => {
    const p = renewalPrefill(
      read({ letterDate: field('31/10'), annualKwh: field(-3), powerUnit: field('per_hour') }),
      tr,
    );
    expect(p.entries).toEqual([]);
  });

  it('warns when the document does not look like a renewal', () => {
    expect(renewalPrefill(read({ isRenewal: field(false) }), tr).notes).toEqual([
      'El documento no parece una renovación de precios: comprueba que es la carta que querías revisar.',
    ]);
  });
});

describe('what a read of the renewal letter leaves out, and what it says of itself', () => {
  const echo: Translate = (key) => key;

  it('reads a cost declared as an amount, and a flag only from a yes or a no', () => {
    const p = renewalPrefill(
      read({
        declaredWithTax: field(1362.36),
        declaredWithoutTax: field('x'),
        separateFromBill: field(false),
      }),
      tr,
    );
    expect(p.entries).toEqual([
      ['declaredWithTax', '1.362,36'],
      ['separateFromBill', 'no'],
    ]);
    expect(renewalPrefill(read({ separateFromBill: field('yes') }), tr).entries).toEqual([]);
  });

  it('opens the energy of a side only for the prices of that side', () => {
    const names = (fields: RenewalExtraction['fields']) =>
      renewalPrefill(read(fields), tr).entries.map(([name]) => name);
    expect(names({ currentPowerP1: field(0.1), nextPowerP1: field(0.1) })).toEqual([
      'currentPowerP1',
      'nextPowerP1',
    ]);
    expect(names({ nextEnergyP1: field(0.2) })).toEqual(['nextEnergyP1', 'nextEnergyPricing']);
    expect(names({ currentEnergyP2: field(0.2) })).toEqual([
      'currentEnergyP2',
      'currentEnergyPricing',
    ]);
  });

  it('says a low answer, a document that is no renewal and a read cut off, in that order', () => {
    const p = renewalPrefill(
      read({ annualKwh: field(100, 'low'), isRenewal: field(false) }, { truncated: true }),
      echo,
    );
    expect(p.notes).toEqual([
      'client.documents.done_low',
      'client.bills.renewal.documents.not_renewal',
      'client.bills.documents.truncated',
    ]);
    expect(
      renewalPrefill(read({ isRenewal: field(true), annualKwh: field(1) }), echo).notes,
    ).toEqual([]);
    expect(renewalPrefill(read({}), echo).notes).toEqual([]);
  });

  it('is how the review reads a letter, with every question asked', () => {
    const letter = read({ annualKwh: field(100), isRenewal: field(false) });
    expect(renewalReading(tr).prefill(letter, {}, [])).toEqual(renewalPrefill(letter, tr));
    expect(applies()).toBe(true);
  });
});
