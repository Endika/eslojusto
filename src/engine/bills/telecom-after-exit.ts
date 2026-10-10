import { addDays, calendarDays, compareDates, max, toIso, type CivilDate } from '../date';
import { addBusinessDays, type HolidayCalendar } from '../law/calendar';
import { round2 } from '../money';
import { billsPhrase } from './calculation';
import { billFinding, single, type BillItem } from './finding';
import type { NormTable } from './norms';
import type { TelecomInput, TelecomLine } from './types';

// Art. 7 RD 899/2009: an exit takes effect within two working days of the request.
export const EXIT_WORKING_DAYS = 2;

export interface AfterExitDeps {
  readonly norms: NormTable;
  readonly holidays: HolidayCalendar;
}

const RULES = ['exit_effective'] as const;

// What a line accrues over the days it shares with `from` onwards, spread evenly over its days.
const accruedFrom = (line: TelecomLine, from: CivilDate): number => {
  const start = max(line.from, from);
  if (compareDates(start, line.to) > 0) return 0;
  return (line.amount * calendarDays(start, line.to)) / calendarDays(line.from, line.to);
};

// Nothing accrued after the exit takes effect may be billed. Saturdays, Sundays and national
// holidays are left out of the working days, which gives the latest day; a regional holiday may still move it,
// so the day right after is only sent to review and never counted.
export function checkChargesAfterExit(
  input: TelecomInput,
  deps: AfterExitDeps,
): readonly BillItem[] {
  const charged = input.lines.flatMap((line, i) => (line.amount > 0 ? [{ line, i }] : []));
  if (charged.length === 0) return [];
  const { norms } = deps;
  const requested = toIso(input.exitRequestedOn);
  const effective = addBusinessDays(input.exitRequestedOn, EXIT_WORKING_DAYS, deps.holidays);
  if (effective.kind === 'missing')
    return [
      single(
        billFinding(
          'charge_after_exit',
          'not_checkable',
          [billsPhrase('after_exit.calendar_missing', { year: { integer: effective.year } })],
          RULES,
          norms,
        ),
      ),
    ];
  const marginDay = addDays(effective.date, 1);
  const counted = addDays(effective.date, 2);
  const effectivePhrase = billsPhrase('after_exit.effective', {
    requested: { date: requested },
    effective: { date: toIso(effective.date) },
  });
  return charged.flatMap(({ line, i }) => {
    const after = round2(accruedFrom(line, counted));
    if (after > 0)
      return [
        single(
          billFinding(
            'charge_after_exit',
            'charged_after_exit',
            [
              effectivePhrase,
              billsPhrase('after_exit.charged', {
                from: { date: toIso(max(line.from, counted)) },
                to: { date: toIso(line.to) },
                euros: { euros: after },
              }),
            ],
            RULES,
            norms,
            { line: i, amount: after, direction: 'over' },
          ),
        ),
      ];
    const margin = round2(accruedFrom(line, marginDay));
    if (margin > 0)
      return [
        single(
          billFinding(
            'charge_after_exit',
            'review_it',
            [
              effectivePhrase,
              billsPhrase('after_exit.margin_day', { day: { date: toIso(marginDay) } }),
            ],
            RULES,
            norms,
            { line: i, amount: margin, direction: 'over' },
          ),
        ),
      ];
    return [];
  });
}
