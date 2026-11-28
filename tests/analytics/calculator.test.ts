import { describe, expect, it } from 'vitest';
import { calculatorAnalytics } from '../../src/analytics/calculator';
import type { Track } from '../../src/analytics/events';
import { reviewFinalPay } from '../../src/engine/review';
import type { FinalPayInput } from '../../src/engine/types';
import { estimateBenefit } from '../../src/engine/unemployment';
import { today } from '../documents/fixtures';

const input: FinalPayInput = {
  cause: 'unfair_dismissal',
  startDate: { y: 2020, m: 1, d: 1 },
  endDate: { y: 2026, m: 8, d: 31 },
  monthlySalary: 3000,
  extraPayProrated: true,
  extraPayCount: 2,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};

const completed = () => {
  const r = reviewFinalPay(input, {}, today);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return {
    review: r.review,
    input,
    figures: {},
    benefit: estimateBenefit(input, 0),
    otherContracts: 0,
    detail: 'unlocked',
  } as const;
};

describe('the calculator events', () => {
  it('reports a detail opened by its item', () => {
    const sent: [string, unknown][] = [];
    const events = calculatorAnalytics(
      ((name: string, props: unknown) => void sent.push([name, props])) as Track,
      () => 0,
      () => 'none',
    );
    events.detailOpened('severance');
    expect(sent).toEqual([['detail_opened', { item: 'severance' }]]);
  });

  it.each([
    [undefined, 'instant'],
    ['staged', 'staged'],
  ] as const)('reports the reveal arm %s as %s', (reveal, expected) => {
    const sent: [string, Record<string, unknown>][] = [];
    const track = ((name: string, props: Record<string, unknown>) =>
      void sent.push([name, props])) as Track;
    calculatorAnalytics(
      track,
      () => 0,
      () => 'none',
      reveal,
    ).reviewCompleted(completed());
    expect(sent[0]?.[1]).toMatchObject({ reveal: expected });
  });
});
