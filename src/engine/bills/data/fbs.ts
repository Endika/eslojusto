import type { Table } from '../tables';
import { BILLS_NORMS } from './norms';

// Funding of the social bonus, € per supply and year, charged by the day.
export const SOCIAL_BONUS_FUNDING: Table<number> = [
  {
    from: '2026-01-01',
    until: '2026-06-25',
    value: 6.979247,
    norm: 'order_ted1524_2025',
    url: BILLS_NORMS.order_ted1524_2025.url,
  },
  {
    from: '2026-06-26',
    until: '2026-12-31',
    value: 9.011295,
    norm: 'order_ted634_2026',
    url: BILLS_NORMS.order_ted634_2026.url,
  },
];
