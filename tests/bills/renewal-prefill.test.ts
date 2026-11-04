import { describe, expect, it } from 'vitest';
import { renewalPrefill } from '../../src/bills/renewal/prefill';
import type { RenewalExtraction, SourcedField } from '../../src/documents/contract';
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
      fixedPrice: 'no',
      energyPricing: 'single',
    });
    expect(p.count).toBe(13);
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
      energyPricing: 'periods',
    });
    expect(p.lowConfidence).toBe(true);
  });

  it('leaves out what it cannot read, and the first renewal, which the person says', () => {
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
