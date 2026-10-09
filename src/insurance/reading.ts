import type { InsuranceFieldName, InsuranceListName } from '../documents/contract';
import type { DocumentReading } from '../documents/ports';
import { removeQuotes, showQuote } from '../documents/quote';
import type { Translate } from '../i18n/client';
import { QUOTED, insurancePrefill } from './prefill';

// How the insurance review takes what was read: its answers, and the documents' words quoted
// beside the questions they answer, folded so each sheet still fits a phone's screen. A new read
// replaces the quotes it brings; starting over removes them all. Its figures are single answers,
// with no list of rows to add to.
export function insuranceReading(
  form: HTMLFormElement,
  tr: Translate,
): DocumentReading<InsuranceFieldName, InsuranceListName> {
  form.addEventListener('reset', () => removeQuotes(form));
  return {
    prefill(extraction, _answers, checks) {
      const p = insurancePrefill(extraction, tr, checks);
      for (const question of QUOTED) {
        const text = p.quotes[question];
        if (text)
          showQuote(form, question, text, {
            label: tr(`client.insurance.documents.quote.${question}`),
            note: tr('client.insurance.documents.quote_note'),
            folded: true,
          });
      }
      return p;
    },
    wordsEveryCheck: true,
  };
}
