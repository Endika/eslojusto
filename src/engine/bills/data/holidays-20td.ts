import type { HolidayCalendar } from '../tables';

// The weekdays whose hours are all P3 under the 2.0TD toll: 6 January and the national holidays
// that no region may replace and that have a fixed date (Circular 3/2020 of the CNMC, art. 7). So
// Good Friday, national but without a fixed date, stays a working day here. The 2026 list keeps the
// holidays the resolution marks as not replaceable (*); 1 November and 6 December fall on a Sunday.
export const TOLL_HOLIDAYS: HolidayCalendar = [
  {
    year: 2026,
    days: [
      '2026-01-01',
      '2026-01-06',
      '2026-05-01',
      '2026-08-15',
      '2026-10-12',
      '2026-12-08',
      '2026-12-25',
    ],
    citation:
      'Circular 3/2020, de 15 de enero, de la Comisión Nacional de los Mercados y la Competencia, art. 7, con la Resolución de 17 de octubre de 2025 de la Dirección General de Trabajo (fiestas laborales de 2026)',
    url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2020-1066',
  },
];
