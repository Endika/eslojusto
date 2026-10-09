import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { INSURANCE_NORMS } from '../../../src/engine/insurance/data/norms';
import { distanceWithdrawal } from '../../../src/engine/insurance/withdrawal';
import { policy } from './input';

const online = (change: Parameters<typeof policy>[0] = {}) =>
  policy({ distance: true, concludedOn: parseDate('2026-10-01'), ...change });

const summary = (today: string, change: Parameters<typeof policy>[0] = {}) =>
  distanceWithdrawal(online(change), parseDate(today), INSURANCE_NORMS).map((f) => ({
    id: f.id,
    status: f.status,
    lastDay: f.lastDay,
    daysLeft: f.daysLeft,
  }));

describe('withdrawal from a policy contracted at a distance (art. 10 Ley 22/2007)', () => {
  it('fourteen calendar days from the conclusion, the first day left out', () => {
    expect(summary('2026-10-09')).toEqual([
      { id: 'distance_withdrawal', status: 'open', lastDay: '2026-10-15', daysLeft: 6 },
    ]);
  });

  it('counts from the receipt of the contract terms when they came later', () => {
    expect(summary('2026-10-09', { policyReceivedOn: parseDate('2026-10-05') })).toEqual([
      { id: 'distance_withdrawal', status: 'open', lastDay: '2026-10-19', daysLeft: 10 },
    ]);
  });

  it('a receipt on the day of the conclusion counts from the conclusion', () => {
    const [f] = distanceWithdrawal(
      online({ policyReceivedOn: parseDate('2026-10-01') }),
      parseDate('2026-10-09'),
      INSURANCE_NORMS,
    );
    expect(f?.calculation[0]?.key).toBe('withdrawal.start');
  });

  it('ends after the last day', () => {
    expect(summary('2026-10-16')).toEqual([
      { id: 'distance_withdrawal', status: 'ended', lastDay: '2026-10-15', daysLeft: null },
    ]);
  });

  it('crosses a leap day', () => {
    expect(summary('2028-02-20', { concludedOn: parseDate('2028-02-20') })[0]?.lastDay).toBe(
      '2028-03-05',
    );
  });

  it('has not started while the contract terms have not arrived', () => {
    expect(summary('2026-10-09', { policyReceived: false })).toEqual([
      { id: 'distance_withdrawal', status: 'not_started', lastDay: null, daysLeft: null },
    ]);
  });

  it('without a day of receipt it counts from the conclusion and says so', () => {
    const [f] = distanceWithdrawal(online(), parseDate('2026-10-09'), INSURANCE_NORMS);
    expect(f?.calculation.map((p) => p.key)).toContain('withdrawal.receipt_unknown');
  });

  it('does not apply to a policy contracted in person', () => {
    expect(summary('2026-10-09', { distance: false })[0]?.status).toBe('not_applicable');
  });

  it('leaves it to review when the channel is not known', () => {
    expect(summary('2026-10-09', { distance: null })).toEqual([
      { id: 'distance_withdrawal', status: 'review_it', lastDay: null, daysLeft: null },
    ]);
  });

  it('asks for the day of the conclusion', () => {
    expect(summary('2026-10-09', { concludedOn: null })[0]?.status).toBe('not_entered');
  });

  it('does not apply before the distance selling law', () => {
    expect(summary('2026-10-09', { concludedOn: parseDate('2007-07-11') })[0]?.status).toBe(
      'not_applicable',
    );
  });

  describe('a home policy a mortgage may require', () => {
    it.each([[true], [null]])('mortgage required: %s, left to review with no date', (required) => {
      const [f, ...rest] = distanceWithdrawal(
        online({ mortgageRequired: required }),
        parseDate('2026-10-09'),
        INSURANCE_NORMS,
      );
      expect(rest).toEqual([]);
      expect([f?.id, f?.status, f?.lastDay, f?.daysLeft]).toEqual([
        'distance_withdrawal',
        'review_it',
        null,
        null,
      ]);
      expect(f?.calculation.map((p) => p.key)).toEqual(['withdrawal.mortgage_unverified']);
      expect(f?.sources.map((s) => s.id)).toEqual([
        'distance_withdrawal',
        'distance_withdrawal_excluded',
      ]);
    });

    it('with no mortgage behind it, fourteen days', () => {
      expect(summary('2026-10-09', { mortgageRequired: false })[0]?.status).toBe('open');
    });
  });

  describe('a motor policy contracted online', () => {
    it('the compulsory cover is excluded and the voluntary covers are left to review', () => {
      expect(summary('2026-10-09', { line: 'car', carCover: 'with_voluntary' })).toEqual([
        {
          id: 'distance_withdrawal_compulsory',
          status: 'not_applicable',
          lastDay: null,
          daysLeft: null,
        },
        {
          id: 'distance_withdrawal_voluntary',
          status: 'review_it',
          lastDay: null,
          daysLeft: null,
        },
      ]);
    });

    it('with the compulsory cover alone there is no withdrawal', () => {
      const findings = distanceWithdrawal(
        online({ line: 'car', carCover: 'compulsory_only' }),
        parseDate('2026-10-09'),
        INSURANCE_NORMS,
      );
      expect(findings.map((f) => f.status)).toEqual(['not_applicable']);
      expect(findings[0]?.sources.map((s) => s.id)).toEqual(['distance_withdrawal_excluded']);
    });

    it('«No lo sé» on the covers keeps the voluntary ones to review', () => {
      expect(summary('2026-10-09', { line: 'car', carCover: null }).map((f) => f.status)).toEqual([
        'not_applicable',
        'review_it',
      ]);
    });
  });
});
