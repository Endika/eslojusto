import type { TelecomFieldName, TelecomListName } from '../../documents/contract';
import type { DocumentReading } from '../../documents/ports';
import { removeQuotes, showQuote } from '../../documents/quote';
import type { Translate } from '../../i18n/client';
import { QUOTED, telecomPrefill } from './prefill';

// How the telecom review takes what was read: its answers, and the contract's words quoted beside
// the questions they answer, folded so each sheet still fits a phone's screen. Starting over
// removes the quotes.
export function telecomReading(
  form: HTMLFormElement,
  tr: Translate,
): DocumentReading<TelecomFieldName, TelecomListName> {
  form.addEventListener('reset', () => removeQuotes(form));
  return {
    prefill(extraction, _answers, checks) {
      const p = telecomPrefill(extraction, tr, checks);
      for (const question of QUOTED) {
        const text = p.quotes[question];
        if (text)
          showQuote(form, question, text, {
            label: tr(`client.bills.documents.telecom.quote.${question}`),
            note: tr('client.bills.documents.telecom.quote_note'),
            folded: true,
          });
      }
      return p;
    },
    wordsEveryCheck: true,
  };
}
