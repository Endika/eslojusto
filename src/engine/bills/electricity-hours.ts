import type { CivilDate } from '../date';
import { isBusinessDay } from '../law/calendar';
import type { HolidayCalendar } from './tables';
import type { EnergyPeriod } from './types';

// The 2.0TD energy period of an hour in the Peninsula and the Balearic Islands (Circular 3/2020 of
// the CNMC, art. 7): on working weekdays P1 from 10 to 14 and from 18 to 22, P2 from 8 to 10, from
// 14 to 18 and from 22 to 24, P3 from 0 to 8; every hour of Saturdays, Sundays and the holidays of
// `calendar` is P3. `missing` when the day's year is not loaded. `hour` is the local hour it starts.
export function energyPeriodAt(
  day: CivilDate,
  hour: number,
  calendar: HolidayCalendar,
): EnergyPeriod | 'missing' {
  const working = isBusinessDay(day, calendar);
  if (working === null) return 'missing';
  if (!working || hour < 8) return 'p3';
  if ((hour >= 10 && hour < 14) || (hour >= 18 && hour < 22)) return 'p1';
  return 'p2';
}
