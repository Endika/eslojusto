import { expect, it } from 'vitest';
import { billsPhrase } from '../../../src/engine/bills/calculation';

it('a phrase with no figures carries no vars at all', () => {
  expect(billsPhrase('official.pending')).toStrictEqual({ key: 'official.pending' });
  expect(billsPhrase('official.missing', { day: { date: '2026-06-01' } })).toStrictEqual({
    key: 'official.missing',
    vars: { day: { date: '2026-06-01' } },
  });
});
