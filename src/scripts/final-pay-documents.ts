import type { FormEntries } from '../calculator/fill';
import type { Calculator } from '../calculator/main';
import type { CompletedReview } from '../calculator/ports';
import { STEPS } from '../calculator/steps';
import { finalPayCase } from '../documents/case';
import { DOCUMENTS } from '../documents/config';
import { FINAL_PAY_EXTRACTION } from '../documents/contract';
import { finalPayReading } from '../documents/final-pay-reading';
import { pageTranslator } from '../i18n/client';
import { wireDocuments, type ReviewHooks } from './documents';

// Answers kept before the holiday unit was asked were in calendar days.
const withHolidayUnit = (saved: FormEntries): FormEntries =>
  saved.some(([name]) => name === 'holidayUnit') ? saved : [...saved, ['holidayUnit', 'calendar']];

// Document reading and the pass on the final pay's page.
export function wireFinalPayDocuments(
  calculator: Calculator,
  hooks: ReviewHooks<CompletedReview>,
  arrival: { hash: string; search: string },
): void {
  const tr = pageTranslator();
  const reading = finalPayReading(calculator.form, tr);
  wireDocuments({
    form: calculator,
    hooks,
    arrival,
    config: DOCUMENTS,
    tr,
    section: {
      extraction: FINAL_PAY_EXTRACTION,
      reading,
      steps: STEPS,
      keptReviewKey: 'eslojusto-revision-en-pago',
      paidReview: finalPayCase,
      decorateResult: (result) => reading.showAgreementOffer(result),
      restore: withHolidayUnit,
    },
  });
}
