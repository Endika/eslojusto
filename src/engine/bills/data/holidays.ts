import type { HolidayCalendar } from '../tables';

// National holidays, one year per resolution of the Dirección General de Trabajo in the BOE: those
// no region may replace, and 6 January, which none replaced in 2026. Regional and local holidays
// are not loaded.
export const NATIONAL_HOLIDAYS: HolidayCalendar = [
  {
    year: 2026,
    days: [
      '2026-01-01',
      '2026-01-06',
      '2026-04-03',
      '2026-05-01',
      '2026-08-15',
      '2026-10-12',
      '2026-12-08',
      '2026-12-25',
    ],
    citation:
      'Resolución de 17 de octubre de 2025, de la Dirección General de Trabajo, por la que se publica la relación de fiestas laborales para el año 2026',
    url: 'https://www.boe.es/diario_boe/txt.php?id=BOE-A-2025-21667',
  },
];
