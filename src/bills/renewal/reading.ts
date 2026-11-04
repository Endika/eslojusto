import type { RenewalFieldName } from '../../documents/contract';
import type { DocumentReading } from '../../documents/ports';
import type { Translate } from '../../i18n/client';
import { renewalPrefill } from './prefill';

// How the renewal review takes what was read: the letter's prices, dates and costs as answers.
// Its figures are single answers, with no list of rows to add to.
export const renewalReading = (tr: Translate): DocumentReading<RenewalFieldName, never> => ({
  prefill: (extraction) => renewalPrefill(extraction, tr),
});
