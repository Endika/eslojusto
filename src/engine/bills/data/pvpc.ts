import type { Table } from '../tables';
import { BILLS_NORMS } from './norms';

// Fixed retail margin of the PVPC, €/kW and year, on P1 only. It is the 2016 figure: no 2026 norm
// confirms or updates it, so it never backs an amount on its own.
export const PVPC_MARGIN: Table<number> = [
  {
    from: '2026-01-01',
    until: '2026-12-31',
    value: 3.113,
    norm: 'order_etu1948_2016',
    url: `${BILLS_NORMS.order_etu1948_2016.url}#ai-2`,
    doubt: 'ccf_not_updated_since_2016',
  },
];
