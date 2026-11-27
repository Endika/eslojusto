import { expect, it } from 'vitest';
import { mortgagePhrase } from '../../../src/engine/mortgage/calculation';

it('a phrase without figures has no vars property at all', () => {
  expect(Object.keys(mortgagePhrase('flags.irph'))).toEqual(['key']);
  expect(mortgagePhrase('flags.irph', { a: { percent: 1 } })).toEqual({
    key: 'flags.irph',
    vars: { a: { percent: 1 } },
  });
});
