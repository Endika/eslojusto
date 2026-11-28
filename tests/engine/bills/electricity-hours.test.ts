import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { TOLL_HOLIDAYS } from '../../../src/engine/bills/data/holidays-20td';
import { energyPeriodAt } from '../../../src/engine/bills/electricity-hours';

const at = (day: string, hour: number) => energyPeriodAt(parseDate(day), hour, TOLL_HOLIDAYS);

describe('the 2.0TD period of an hour', () => {
  it('says so for a year the calendar has not loaded', () => {
    expect(at('2027-01-05', 12)).toBe('missing');
  });
});
