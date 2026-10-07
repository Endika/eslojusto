import { parseDate as f } from '../../../src/engine/date';
import type { RentalInput, RentUpdateInput } from '../../../src/engine/rental/types';

// A synthetic contract; every test overrides what it looks at.
export const contract = (change: Partial<RentalInput> = {}): RentalInput => ({
  contractType: 'main_home',
  signedOn: f('2021-03-15'),
  startDate: f('2021-03-20'),
  landlordType: 'person',
  largeLandlord: false,
  agreedMonths: 60,
  initialRent: 1000,
  updateClause: 'ipc',
  region: 'MD',
  stressedZone: null,
  fees: [],
  deposit: 1000,
  guarantees: [],
  advanceMonths: null,
  updates: [],
  charges: [],
  moveOut: null,
  ...change,
});

// A written update charged from the anniversary month, notified the month before.
export const update = (
  anniversary: string,
  previousRent: number,
  newRent: number,
  change: Partial<RentUpdateInput> = {},
): RentUpdateInput => {
  const day = f(anniversary);
  const before = day.m === 1 ? { y: day.y - 1, m: 12, d: 1 } : { y: day.y, m: day.m - 1, d: 1 };
  return {
    anniversary: day,
    effectiveOn: day,
    previousRent,
    newRent,
    chargedFrom: { y: day.y, m: day.m, d: 1 },
    notice: 'letter',
    noticeOn: before,
    agreedInWriting: false,
    ...change,
  };
};
