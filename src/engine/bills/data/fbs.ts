import type { Table } from '../tables';
import { BILLS_NORMS } from './norms';

// Funding of the social bonus: the orders fix euros per supply («euros/CUPS») without a period;
// read as a yearly figure and charged by the day, which is an interpretation. The 2026 order takes
// effect on 26-06 but applies «desde la liquidación 7 de 2026»: the cut-off date is a reading too.
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
