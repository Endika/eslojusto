import { describe, expect, it } from 'vitest';
import { rateFor, type DataSeries } from '../../../src/engine/law/series';

const SERIES: DataSeries = {
  id: 'test_series',
  citation: 'Serie de prueba',
  url: 'https://example.org/series.csv',
  code: 'T1',
  unit: 'percent',
  retrievedOn: '2030-06-02',
  lastModified: '2030-06-01',
  since: '2030-02',
  coveredUntil: '2030-05',
  values: [
    { month: '2030-02', value: 1.5 },
    { month: '2030-03', value: null },
    { month: '2030-05', value: 2.5 },
  ],
};

describe('rateFor', () => {
  it.each([
    ['2030-01', { kind: 'no_data' }],
    ['2030-02', { kind: 'ok', month: '2030-02', value: 1.5 }],
    ['2030-03', { kind: 'no_data' }],
    ['2030-05', { kind: 'ok', month: '2030-05', value: 2.5 }],
    ['2030-06', { kind: 'not_published' }],
  ])('the figure of %s', (month, expected) => {
    expect(rateFor(SERIES, month)).toEqual(expected);
  });

  it('refuses a covered month the file has no row for', () => {
    expect(() => rateFor(SERIES, '2030-04')).toThrow('test_series has no row for 2030-04');
  });
});
