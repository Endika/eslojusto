import type { PowerEnergyPrices, Table } from '../tables';
import { BILLS_NORMS } from './norms';

// Charges of the electricity system for consumer segment 1 (2.0TD): €/kW and year for power,
// €/kWh for energy.
export const CHARGES: Table<PowerEnergyPrices> = [
  {
    from: '2026-01-01',
    until: '2026-12-31',
    value: {
      power: { p1: 4.379461, p2: 0.281653 },
      energy: { p1: 0.064292, p2: 0.012858, p3: 0.003215 },
    },
    norm: 'order_ted1524_2025',
    url: BILLS_NORMS.order_ted1524_2025.url,
  },
];
