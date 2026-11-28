import type { RentUpdateReading } from '../engine/rental/rent-update';
import type { RentUpdateItem } from '../engine/rental/review';
import type { RentalSource } from '../engine/rental/rules';

// The norm behind the cap a reading was worked out under, when it had one.
export const capSource = (r: RentUpdateReading, item: RentUpdateItem): RentalSource | undefined =>
  item.sources.find((s) => s.id === r.cap?.rule);
