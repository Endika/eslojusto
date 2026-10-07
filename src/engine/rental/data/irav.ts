import type { IndexSeries, IndexValue } from '../indices';

// INE publication calendar of the IRAV; the IRAV comes out with the definitive CPI.
const CALENDAR = 'https://servicios.ine.es/wstempus/js/ES/PUBLICACIONFECHA_PUBLICACION/654';

const month = (month: string, rate: number, publishedOn: string): IndexValue => ({
  month,
  rate,
  publishedOn,
  publishedUrl: CALENDAR,
});

// LAU DA 11.ª and Resolución de 18-12-2024 de la Presidencia del INE (BOE-A-2024-26685).
export const IRAV: IndexSeries = {
  id: 'irav',
  citation: 'INE, Índice de Referencia de Arrendamientos de Vivienda (IRAV), variación anual',
  url: 'https://servicios.ine.es/wstempus/js/ES/DATOS_SERIE/IRAV1',
  table: 72975,
  series: 'IRAV1',
  coveredUntil: '2026-10-07',
  values: [
    month('2024-11', 2.2, '2025-01-02'),
    month('2024-12', 2.28, '2025-01-15'),
    month('2025-01', 2.19, '2025-02-14'),
    month('2025-02', 2.08, '2025-03-14'),
    month('2025-03', 1.98, '2025-04-11'),
    month('2025-04', 2.09, '2025-05-14'),
    month('2025-05', 1.99, '2025-06-13'),
    month('2025-06', 2.1, '2025-07-15'),
    month('2025-07', 2.15, '2025-08-13'),
    month('2025-08', 2.19, '2025-09-12'),
    month('2025-09', 2.22, '2025-10-15'),
    month('2025-10', 2.25, '2025-11-14'),
    month('2025-11', 2.29, '2025-12-12'),
    month('2025-12', 2.32, '2026-01-15'),
    month('2026-01', 2.14, '2026-02-13'),
    month('2026-02', 2.16, '2026-03-13'),
    month('2026-03', 2.47, '2026-04-14'),
    month('2026-04', 2.4, '2026-05-14'),
    month('2026-05', 2.48, '2026-06-12'),
    month('2026-06', 2.44, '2026-07-15'),
    month('2026-07', 2.49, '2026-08-13'),
    month('2026-08', 2.47, '2026-09-15'),
  ],
};
