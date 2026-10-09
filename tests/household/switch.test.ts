import { describe, expect, it } from 'vitest';
import { LAST_UPDATED } from '../../src/content/updated';
import { HOUSEHOLD_BUILD } from '../../src/content/sections';
import { clientStrings } from '../../src/i18n';

// Unit tests run without PUBLIC_HOUSEHOLD, as the default build does.
describe('with the household switch off', () => {
  it('is not built', () => {
    expect(HOUSEHOLD_BUILD).toBe(false);
  });

  it('has no sitemap date for the page', () => {
    expect(LAST_UPDATED).not.toHaveProperty(['/empleada-de-hogar/']);
  });

  it('sends the household strings to no page', () => {
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
