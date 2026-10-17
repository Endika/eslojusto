import { describe, expect, it } from 'vitest';
import { clientStrings } from '../../src/i18n';

describe('the household strings', () => {
  it('go to the household page alone', () => {
    for (const options of [{}, { rental: true, employment: true, documents: true }])
      expect(Object.keys(clientStrings('es', options)).filter((k) => /household/.test(k))).toEqual(
        [],
      );
    expect(
      Object.keys(clientStrings('es', { household: true })).some((k) =>
        k.startsWith('client.household.'),
      ),
    ).toBe(true);
  });
});
