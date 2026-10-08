import { parseDate as f } from '../../src/engine/date';
import { RENTAL_TABLES } from '../../src/engine/rental/data/tables';
import { reviewRental, type RentalReview } from '../../src/engine/rental/review';
import type { RentalInput } from '../../src/engine/rental/types';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { contract, update } from '../engine/rental/fixtures';

export { contract, update };

export const TODAY = f('2026-10-08');
export const tr: Translate = (key, vars) => t('es', key, vars);

export const review = (input: RentalInput): RentalReview => {
  const r = reviewRental(input, TODAY, RENTAL_TABLES);
  if (!r.ok) throw new Error(`invalid: ${JSON.stringify(r.errors)}`);
  return r.review;
};

// 20-03-2025: the IRAV of February 2025 (2,08 %) caps a 3 % rise; 9,20 € a month for 12 months.
export const riseAboveIrav = contract({
  signedOn: f('2024-03-15'),
  startDate: f('2024-03-20'),
  updates: [update('2025-03-20', 1000, 1030)],
});

// 25-06-2023: a 5 % rise agreed in writing, with «No lo sé» on a large landlord.
export const unknownLargeLandlord = contract({
  signedOn: f('2020-06-20'),
  startDate: f('2020-06-25'),
  largeLandlord: null,
  updateClause: 'fixed_percent',
  fixedPercent: 5,
  updates: [update('2023-06-25', 1000, 1050, { agreedInWriting: true })],
});

// 15-04-2026, inside the window of the repealed RDL 8/2026.
export const repealedWindow = contract({
  signedOn: f('2024-04-10'),
  startDate: f('2024-04-15'),
  updateClause: 'irav',
  updates: [update('2026-04-15', 1000, 1024.7)],
});
