import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { longDay, monthName, monthYear } from '../../src/i18n/dates';

const tr: Translate = (key, vars) => t('es', key, vars);
const intl = (options: Intl.DateTimeFormatOptions) => (iso: string) =>
  new Intl.DateTimeFormat('es-ES', { ...options, timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

// Every day of a leap year, so the dictionary's Spanish matches what Intl wrote before it.
const days = Array.from({ length: 366 }, (_, i) =>
  new Date(Date.UTC(2028, 0, 1 + i)).toISOString().slice(0, 10),
);

describe('dates in words, from the dictionary', () => {
  it('write every day of the year as Intl does in Spanish', () => {
    const long = intl({ day: 'numeric', month: 'long', year: 'numeric' });
    expect(days.map((d) => longDay(d, tr))).toEqual(days.map(long));
  });

  it('write every month, alone and with its year, as Intl does in Spanish', () => {
    const months = days.filter((d) => d.endsWith('-01'));
    expect(months.map((d) => monthYear(d.slice(0, 7), tr))).toEqual(
      months.map(intl({ month: 'long', year: 'numeric' })),
    );
    expect(months.map((_, i) => monthName(i + 1, tr))).toEqual(months.map(intl({ month: 'long' })));
  });
});
