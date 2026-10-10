import type { MortgageFieldName, MortgageListName } from '../documents/contract';
import type { DocumentReading } from '../documents/ports';
import { removeQuotes, showQuote } from '../documents/quote';
import type { Translate } from '../i18n/client';
import { QUOTED, mortgagePrefill } from './prefill';

// How the mortgage review takes what was read: its answers, and each clause of the deed quoted
// word for word beside the question it answers, folded so each sheet still fits a phone's screen.
// A new read replaces the quotes it brings; starting over removes them all. Every invoice lands on
// its own question, with no list of rows to add to.
export function mortgageReading(
  form: HTMLFormElement,
  tr: Translate,
): DocumentReading<MortgageFieldName, MortgageListName> {
  form.addEventListener('reset', () => removeQuotes(form));
  return {
    prefill(extraction, _answers, checks) {
      const p = mortgagePrefill(extraction, tr, checks);
      for (const question of QUOTED) {
        const text = p.quotes[question];
        if (text)
          showQuote(form, question, text, {
            label: tr(`client.mortgage.documents.quote.${question}`),
            note: tr('client.mortgage.documents.quote_note'),
            folded: true,
          });
      }
      return p;
    },
    wordsEveryCheck: true,
  };
}
