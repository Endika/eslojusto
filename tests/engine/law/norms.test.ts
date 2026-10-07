import { describe, expect, it } from 'vitest';
import { normStanding, type Norm } from '../../../src/engine/law/norms';

const norm = (change: Partial<Norm<'x'>> = {}): Norm<'x'> => ({
  id: 'x',
  citation: 'Ley de prueba 1/2030',
  url: 'https://www.boe.es/buscar/doc.php?id=BOE-A-2030-1',
  inForceSince: '2030-03-01',
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
  ...change,
});

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
});
