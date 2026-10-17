import type { ClientKey, Translate } from './client';

// Dates in words, from the dictionary, so each page writes them in its own language and a letter
// or a report, read with the Spanish words, in Spanish. Figures stay in the Spanish format.
export const monthName = (month: number, tr: Translate): string =>
  tr(`client.month.${month}` as ClientKey);

// «2026-10» → «octubre de 2026».
export const monthYear = (month: string, tr: Translate): string => {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return tr('client.date.month_year', { mes: monthName(m, tr), anio: y });
};

// «2026-10-08» → «8 de octubre de 2026». The month has its own words here: languages with cases
// write it otherwise after a day (Ukrainian «8 жовтня», not «жовтень»).
export const longDay = (iso: string, tr: Translate): string => {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return tr('client.date.long', {
    dia: d,
    mes: tr(`client.date.day_month.${m}` as ClientKey),
    anio: y,
  });
};
