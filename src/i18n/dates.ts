import type { ClientKey, Translate } from './client';

// Dates in words, from the dictionary, so each page writes them in its own language and a letter
// or a report, read with the Spanish words, in Spanish. Figures stay in the Spanish format.
export const monthName = (month: number, tr: Translate): string =>
  tr(`client.month.${month}` as ClientKey);

// Basque writes the year's ending as the figure sounds: «2025eko» (bost), «2026ko» (sei). Its
// date templates mark the year «{anio}(e)ko», and this picks the ending by the last two digits.
const basqueYear = (text: string): string =>
  text.replace(/(\d+)\(e\)ko/g, (_, year: string) => {
    const y = Number(year);
    const n = y % 100;
    const e =
      n === 0
        ? Math.floor(y / 100) % 10 !== 0
        : n % 20 === 11
          ? false
          : n % 10 === 1 || n % 10 === 5 || n % 20 === 10;
    return `${year}${e ? 'eko' : 'ko'}`;
  });

// «2026-10» → «octubre de 2026».
export const monthYear = (month: string, tr: Translate): string => {
  const [y = 0, m = 1] = month.split('-').map(Number);
  return basqueYear(tr('client.date.month_year', { mes: monthName(m, tr), anio: y }));
};

// «2026-10-08» → «8 de octubre de 2026». The month has its own words here: languages with cases
// write it otherwise after a day (Ukrainian «8 жовтня», not «жовтень»).
export const longDay = (iso: string, tr: Translate): string => {
  const [y = 0, m = 1, d = 1] = iso.split('-').map(Number);
  return basqueYear(
    tr('client.date.long', {
      dia: d,
      mes: tr(`client.date.day_month.${m}` as ClientKey),
      anio: y,
    }),
  );
};
