import { describe, expect, it } from 'vitest';
import { BILLS_NORMS } from '../../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../../src/engine/bills/data/tables';
import { countedAmount } from '../../../src/engine/bills/finding';
import { checkChargesAfterExit } from '../../../src/engine/bills/telecom-after-exit';
import type { TelecomLine } from '../../../src/engine/bills/types';
import { parseDate } from '../../../src/engine/date';
import { only, telecom } from './input';

const deps = { norms: BILLS_NORMS, holidays: BILLS_TABLES.holidays };

const line = (from: string, to: string, amount: number): TelecomLine => ({
  from: parseDate(from),
  to: parseDate(to),
  amount,
});

const check = (exit: string, lines: readonly TelecomLine[]) =>
  checkChargesAfterExit(telecom({ exitRequestedOn: parseDate(exit), lines }), deps).map((item) => {
    const f = only(item);
    return { status: f.status, line: f.line, amount: f.amount, counted: countedAmount(item) };
  });

// Requested on Thursday 02-04-2026: Good Friday (03-04) is a national holiday and the weekend
// follows, so the exit takes effect on Tuesday 07-04, two working days later. Wednesday 08-04 is
// left as a margin; from 09-04 on, 22 of April's 30 days are counted: 30 × 22 / 30 = 22,00.
describe('charges after the exit', () => {
  it('counts what accrued after the exit took effect, with a holiday in between', () => {
    const items = checkChargesAfterExit(
      telecom({
        exitRequestedOn: parseDate('2026-04-02'),
        lines: [line('2026-03-01', '2026-03-31', 30), line('2026-04-01', '2026-04-30', 30)],
      }),
      deps,
    );
    expect(items.map((item) => [only(item).status, only(item).line, countedAmount(item)])).toEqual([
      ['charged_after_exit', 1, 22],
    ]);
    expect(only(items[0] as (typeof items)[number]).calculation).toEqual([
      {
        key: 'after_exit.effective',
        vars: { requested: { date: '2026-04-02' }, effective: { date: '2026-04-07' } },
      },
      {
        key: 'after_exit.charged',
        vars: { from: { date: '2026-04-09' }, to: { date: '2026-04-30' }, euros: { euros: 22 } },
      },
    ]);
    expect(only(items[0] as (typeof items)[number]).sources.map((s) => s.citation)).toEqual([
      `Real Decreto 899/2009, art. 7 (${BILLS_NORMS.rd899_2009.citation})`,
    ]);
  });

  it('sends a charge on the day right after to review, never counted', () => {
    expect(check('2026-04-02', [line('2026-03-08', '2026-04-08', 32)])).toEqual([
      { status: 'review_it', line: 0, amount: 1, counted: 0 },
    ]);
  });

  it('gives nothing up to the day the exit takes effect', () => {
    expect(check('2026-04-02', [line('2026-03-08', '2026-04-07', 31)])).toEqual([]);
  });

  it('leaves out refunds', () => {
    expect(check('2026-04-02', [line('2026-04-01', '2026-04-30', -30)])).toEqual([]);
  });

  it('cannot be checked over a year with no holidays loaded', () => {
    expect(check('2026-12-30', [line('2027-01-01', '2027-01-31', 30)])).toEqual([
      { status: 'not_checkable', line: null, amount: null, counted: 0 },
    ]);
  });
});
