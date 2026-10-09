import type { PowerEnergyPrices, Table } from '../tables';
import { BILLS_NORMS } from './norms';

// Transmission and distribution tolls of the 2.0TD tariff: €/kW and year for power, €/kWh for
// energy.
export const TOLLS: Table<PowerEnergyPrices> = [
  {
    from: '2026-01-01',
    until: '2026-12-31',
    value: {
      power: { p1: 23.324952, p2: 0.44377 },
      energy: { p1: 0.033261, p2: 0.016409, p3: 0.000077 },
    },
    norm: 'cnmc_tolls_2026',
    url: BILLS_NORMS.cnmc_tolls_2026.url,
  },
];
