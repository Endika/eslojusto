import type { Range } from '../engine/money';
import { formatEuros, formatInteger, formatWholeEuros } from '../calculator/number';

export { formatEuros as euros, formatInteger as integer, formatWholeEuros as wholeEuros };

// «750,00 €», or «entre 725,81 € y 750,00 €» when the two counts differ.
export const euroRange = (r: Range): string =>
  r.min === r.max ? formatEuros(r.min) : `entre ${formatEuros(r.min)} y ${formatEuros(r.max)}`;

// «2.625–2.685 €», in whole euros, for a summary table.
export const wholeEuroRange = (r: Range): string =>
  Math.round(r.min) === Math.round(r.max)
    ? formatWholeEuros(r.min)
    : `${formatInteger(Math.round(r.min))}–${formatWholeEuros(r.max)}`;
