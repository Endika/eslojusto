import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { renewalIncomplete, renewalMerge, RENEWAL_MERGE_RULES } from '../src/domain/renewal-merge';
import { RENEWAL_SECTIONS } from '../src/domain/renewal-schema';
import { f, page } from './support/fields';

const row = (term: string, period: string, before: number, after: number, unit: string) => ({
  term,
  period,
  before,
  after,
  unit,
  confidence: 'high',
});
const pack = (letter: Record<string, unknown>, pages = [page(1, 'price_change_notice')]) => {
  const toolInput = { pages, price_change_notice: letter };
  const reading = parseReading(toolInput, pages.length, 'renewal');
  return { reading, merged: renewalMerge(reading, toolInput) };
};
const values = (letter: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(pack(letter).merged.fields).map(([name, field]) => [name, field.value]),
  );

describe('renewalMerge', () => {
  it('merges every letter field the form takes from a single field', () => {
    const sources = Object.values(RENEWAL_MERGE_RULES).flatMap((from) =>
      from.map(([, field]) => field),
    );
    const own = Object.keys(RENEWAL_SECTIONS.price_change_notice.fields);
    for (const field of sources.filter((s) => s !== '')) expect(own).toContain(field);
  });

  it('flattens the prices of a letter with one energy price', () => {
    expect(
      values({
        priceChanges: [
          row('power', 'p1', 0.110283, 0.12303, 'per_kw_day'),
          row('power', 'p2', 0.033469, 0.052329, 'per_kw_day'),
          row('energy', 'all', 0.144972, 0.1678, 'per_kwh'),
        ],
      }),
    ).toEqual({
      powerUnit: 'per_kw_day',
      currentPowerP1: 0.110283,
      nextPowerP1: 0.12303,
      currentPowerP2: 0.033469,
      nextPowerP2: 0.052329,
      currentEnergy: 0.144972,
      nextEnergy: 0.1678,
    });
  });

  it('flattens an energy price per period and takes the power unit from the letter', () => {
    expect(
      values({
        priceChanges: [
          row('power', 'p1', 30.5, 32.1, 'per_kw_year'),
          row('energy', 'p1', 0.15, 0.17, 'per_kwh'),
          row('energy', 'p3', 0.09, 0.11, 'per_kwh'),
        ],
      }),
    ).toEqual({
      powerUnit: 'per_kw_year',
      currentPowerP1: 30.5,
      nextPowerP1: 32.1,
      currentEnergyP1: 0.15,
      nextEnergyP1: 0.17,
      currentEnergyP3: 0.09,
      nextEnergyP3: 0.11,
    });
  });

  it('leaves fixedPrice out when the letter does not say and renames the declared figures', () => {
    const merged = values({
      isRenewal: f(true),
      annualConsumptionKwh: f(4190.2),
      estimatedCostNewWithoutTax: f(1071.15),
      estimatedCostNewWithTax: f(1362.36),
    });
    expect(merged).toEqual({
      isRenewal: true,
      annualKwh: 4190.2,
      declaredWithoutTax: 1071.15,
      declaredWithTax: 1362.36,
    });
  });

  it('calls a legible letter without a single price incomplete', () => {
    const { reading, merged } = pack({ sentOn: f('2026-10-31') });
    expect(renewalIncomplete(reading, merged)).toBe(true);
    const priced = pack({ priceChanges: [row('energy', 'all', 0.14, 0.16, 'per_kwh')] });
    expect(renewalIncomplete(priced.reading, priced.merged)).toBe(false);
  });

  it('reads a notice printed on a bill, with its prices and not as a letter of its own', () => {
    const { merged } = pack({
      separateFromBill: f(false),
      priceChanges: [row('energy', 'all', 0.14, 0.16, 'per_kwh')],
    });
    expect(merged.fields.separateFromBill?.value).toBe(false);
    expect(merged.fields.nextEnergy?.value).toBe(0.16);
  });

  describe('prices that cannot be read as one', () => {
    const incomplete = (rows: ReturnType<typeof row>[]) => {
      const { reading, merged } = pack({ priceChanges: rows });
      return { merged, flagged: renewalIncomplete(reading, merged) };
    };

    it('leaves the power unit out when the power rows disagree on it', () => {
      const { merged, flagged } = incomplete([
        row('power', 'p1', 0.11, 0.12, 'per_kw_day'),
        row('power', 'p2', 30, 32, 'per_kw_year'),
      ]);
      expect(merged.fields.powerUnit).toBeUndefined();
      expect(merged.fields.nextPowerP1?.value).toBe(0.12);
      expect(flagged).toBe(true);
    });

    it('leaves the power unit out when a power row is priced per kWh', () => {
      const { merged, flagged } = incomplete([row('power', 'p1', 0.11, 0.12, 'per_kwh')]);
      expect(merged.fields.powerUnit).toBeUndefined();
      expect(flagged).toBe(true);
    });

    it('flags a power price for P3 or all the day, which the form has no field for', () => {
      expect(incomplete([row('power', 'p3', 0.1, 0.11, 'per_kw_day')]).flagged).toBe(true);
      expect(incomplete([row('power', 'all', 0.1, 0.11, 'per_kw_day')]).flagged).toBe(true);
    });

    it('leaves a price out when two rows give different values for it', () => {
      const { merged, flagged } = incomplete([
        row('energy', 'all', 0.14, 0.16, 'per_kwh'),
        row('energy', 'all', 0.14, 0.17, 'per_kwh'),
      ]);
      expect(merged.fields.nextEnergy).toBeUndefined();
      expect(merged.fields.currentEnergy?.value).toBe(0.14);
      expect(flagged).toBe(true);
    });

    it('leaves an energy price out when it is not in euros per kWh', () => {
      const { merged, flagged } = incomplete([row('energy', 'all', 0.14, 0.16, 'per_kw_day')]);
      expect(merged.fields.currentEnergy).toBeUndefined();
      expect(merged.fields.nextEnergy).toBeUndefined();
      expect(flagged).toBe(true);
    });

    it('leaves out the energy prices of a side given both for all the day and by period', () => {
      const { merged, flagged } = incomplete([
        row('energy', 'all', 0.14, 0.16, 'per_kwh'),
        row('energy', 'p1', 0.15, 0.17, 'per_kwh'),
      ]);
      for (const name of [
        'currentEnergy',
        'currentEnergyP1',
        'nextEnergy',
        'nextEnergyP1',
      ] as const)
        expect(merged.fields[name]).toBeUndefined();
      expect(flagged).toBe(true);
    });

    it('keeps a price two rows state alike', () => {
      const { merged, flagged } = incomplete([
        row('energy', 'all', 0.14, 0.16, 'per_kwh'),
        row('energy', 'all', 0.14, 0.16, 'per_kwh'),
      ]);
      expect(merged.fields.nextEnergy?.value).toBe(0.16);
      expect(flagged).toBe(false);
    });
  });
});
