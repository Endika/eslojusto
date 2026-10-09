import type { MeterRent, Table } from '../tables';
import { BILLS_NORMS } from './norms';

// Regulated monthly rent of a meter, in €. No norm sets a daily figure.
export const METER_RENT: Table<MeterRent> = [
  {
    from: '2026-01-01',
    until: null,
    value: { singlePhase: 0.81, threePhase: 1.36 },
    norm: 'order_iet1491_2013',
    url: `${BILLS_NORMS.order_iet1491_2013.url}#dt`,
  },
];
