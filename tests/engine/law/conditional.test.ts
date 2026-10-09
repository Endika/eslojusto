import { describe, expect, it } from 'vitest';
import { CONDITION_GRACE_DAYS, conditionBreaches } from '../../../src/engine/law/verification';
import { norm, statute } from './fixtures';
import { LAW_SECTIONS } from './registry';

const condition = {
  text: 'Que el dato de prueba de septiembre supere el 15 %',
  decidesOn: '2030-10-31',
  source: 'statute',
  met: null,
};
const open = { x: norm({ status: 'conditional', condition }) };
const sources = { statute: statute() };

describe('open conditions', () => {
  it(`may stay open up to ${CONDITION_GRACE_DAYS} days after their figure is due`, () => {
    expect(conditionBreaches(open, sources, '2030-11-07')).toEqual([]);
  });

  it('stop the build on the next day', () => {
    expect(conditionBreaches(open, sources, '2030-11-08')).toEqual([
      { norm: 'x', reason: 'overdue', decidesOn: '2030-10-31' },
    ]);
  });

  it('are never overdue once settled either way', () => {
    const settled = (met: boolean) => ({
      x: norm({ status: 'conditional', condition: { ...condition, met } }),
    });
    expect(conditionBreaches(settled(true), sources, '2031-01-01')).toEqual([]);
    expect(conditionBreaches(settled(false), sources, '2031-01-01')).toEqual([]);
  });

  it('name their condition and a source the section holds', () => {
    expect(
      conditionBreaches({ x: norm({ status: 'conditional' }) }, sources, '2030-01-01'),
    ).toEqual([{ norm: 'x', reason: 'no_condition' }]);
    expect(conditionBreaches(open, {}, '2030-01-01')).toEqual([
      { norm: 'x', reason: 'unknown_source', source: 'statute' },
    ]);
  });
});

// Run by the monthly review with `BILLS_REVIEW=1 npm run bills:due`: it reads today's date, which
// CI never does, so a figure just out never turns an unrelated PR red.
describe.runIf(process.env['BILLS_REVIEW'] === '1')('open conditions today (by hand)', () => {
  it.each(LAW_SECTIONS.map((s) => [s.name, s] as const))(
    '%s has no condition left open past its figure',
    (_, section) => {
      const today = new Date().toISOString().slice(0, 10);
      expect(conditionBreaches(section.norms, section.sources, today)).toEqual([]);
    },
  );
});

describe('the sections today, on a fixed day', () => {
  it.each(LAW_SECTIONS.map((s) => [s.name, s] as const))(
    '%s names a known source for every condition',
    (_, section) => {
      expect(
        conditionBreaches(section.norms, section.sources, '2026-10-09').filter(
          (b) => b.reason !== 'overdue',
        ),
      ).toEqual([]);
    },
  );
});
