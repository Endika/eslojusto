import type { SocialBonusDiscount, Table } from '../tables';
import { BILLS_NORMS } from './norms';

// Art. 1.1 RDL 7/2026 sets the 2026 discounts «en el período comprendido entre el 1 de enero y el
// 31 de diciembre de 2026», reaching back before it came into force; art. 1.2 has the reference
// retailers make up, in their next bill, the days from 26-02-2026 billed without them.
export const SOCIAL_BONUS_DISCOUNT: Table<SocialBonusDiscount> = [
  {
    from: '2026-01-01',
    until: '2026-12-31',
    value: { vulnerable: 42.5, severe: 57.5 },
    norm: 'rdl7_2026',
    appliesBack: true,
    url: `${BILLS_NORMS.rdl7_2026.url}#a1`,
  },
];

// kWh a year with the discount, in the order of annex I.
export const SOCIAL_BONUS_CAPS: Table<readonly number[]> = [
  {
    from: '2026-01-01',
    until: '2026-12-31',
    value: [1587, 2222, 2698, 4761],
    norm: 'rd897_2017',
    url: `${BILLS_NORMS.rd897_2017.url}#ai`,
  },
];
