import { describe, expect, it } from 'vitest';
import { normStanding } from '../../../src/engine/law/norms';
import { norm } from './fixtures';

describe('norm standing', () => {
  it.each([
    ['2030-02-28', 'not_in_force'],
    ['2030-03-01', 'in_force'],
    ['2099-12-31', 'in_force'],
  ])('a norm in force with no known end, on %s', (day, expected) => {
    expect(normStanding(norm(), day)).toBe(expected);
  });

  it.each([
    ['2030-06-30', 'in_force'],
    ['2030-07-01', 'not_in_force'],
  ])('a norm in force until a known day, on %s', (day, expected) => {
    expect(normStanding(norm({ inForceUntil: '2030-06-30' }), day)).toBe(expected);
  });

  it.each([
    ['2030-02-28', 'not_in_force'],
    ['2030-03-01', 'pending_validation'],
    ['2031-01-01', 'pending_validation'],
  ])('a norm pending validation, on %s', (day, expected) => {
    expect(normStanding(norm({ status: 'pending_validation' }), day)).toBe(expected);
  });

  const repealed = norm({
    status: 'repealed',
    inForceUntil: '2030-04-10',
    endUncertainUntil: '2030-04-11',
    statusSince: '2030-04-10',
    statusUrl: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2030-2',
  });

  it.each([
    ['2030-02-28', 'not_in_force'],
    ['2030-03-01', 'repealed_window'],
    ['2030-04-10', 'repealed_window'],
    ['2030-04-11', 'repealed_window'],
    ['2030-04-12', 'not_in_force'],
  ])('a repealed norm with a doubtful last day, on %s', (day, expected) => {
    expect(normStanding(repealed, day)).toBe(expected);
  });

  it('a norm repealed before it took effect never stands', () => {
    const never = norm({ status: 'repealed', inForceUntil: '2030-02-27' });
    expect(normStanding(never, '2030-03-01')).toBe('not_in_force');
  });

  const conditional = norm({
    status: 'conditional',
    inForceUntil: '2030-03-31',
    condition: {
      text: 'Que el dato de prueba supere el 15 %',
      decidesOn: '2030-02-15',
      source: 's',
      met: null,
    },
  });

  it.each([
    ['2030-02-28', 'not_in_force'],
    ['2030-03-01', 'conditional'],
    ['2030-03-31', 'conditional'],
    ['2030-04-01', 'not_in_force'],
  ])('a measure resting on an open condition, on %s', (day, expected) => {
    expect(normStanding(conditional, day)).toBe(expected);
  });

  it('a condition settled as not met never stands; settled as met, the measure is in force', () => {
    const { condition } = conditional;
    if (condition === undefined) throw new Error('no condition');
    const settled = (met: boolean) => ({ ...conditional, condition: { ...condition, met } });
    expect(normStanding(settled(false), '2030-03-15')).toBe('not_in_force');
    expect(normStanding(settled(true), '2030-03-15')).toBe('in_force');
    expect(normStanding(settled(true), '2030-04-01')).toBe('not_in_force');
  });

  it.each(['2030-02-28', '2030-03-01', '2099-12-31'])('a draft never stands, on %s', (day) => {
    expect(normStanding(norm({ status: 'draft' }), day)).toBe('not_in_force');
  });
});
