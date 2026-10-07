import { addDays, addMonthsClamped, calendarDays, compareDates } from '../date';
import type { EmploymentInput, Modality } from './types';

// Fixed-term contracts of art. 15 ET, the reformed ones and those it abolished.
const FIXED_TERM: ReadonlySet<Modality> = new Set([
  'production',
  'production_occasional',
  'replacement',
  'replacement_selection',
  'work_or_service',
  'eventual',
  'interim',
]);

export const isFixedTerm = (modality: Modality): boolean => FIXED_TERM.has(modality);

// Open-ended modalities; `unknown` is neither.
export const isOpenEnded = (modality: Modality): boolean =>
  modality === 'permanent' || modality === 'discontinuous';

// Calendar days from start to the agreed end, both included; null without an end date.
export const agreedDays = (input: EmploymentInput): number | null =>
  input.endDate === null ? null : calendarDays(input.startDate, input.endDate);

// Whether the agreed term fits within `months` counted from the start day.
export const lastsAtMostMonths = (input: EmploymentInput, months: number): boolean | null =>
  input.endDate === null
    ? null
    : compareDates(input.endDate, addDays(addMonthsClamped(input.startDate, months), -1)) <= 0;
