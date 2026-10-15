import type { TelecomFieldName, TelecomListName } from '../../documents/contract';
import type { DocumentReading } from '../../documents/ports';
import { removeQuotes, showQuote } from '../../documents/quote';
import type { CivilDate } from '../../engine/date';
import type { Translate } from '../../i18n/client';
import { chargesMemory, readBills, renderCharges } from './charges';
import { QUOTED, telecomPrefill } from './prefill';

// How the telecom review takes what was read: its answers, the contract's words quoted beside the
// questions they answer, folded so each sheet still fits a phone's screen, and every line of the
// bills listed beside what was read, whatever the exit. Starting over removes the quotes and the
// lines.
export function telecomReading(
  form: HTMLFormElement,
  tr: Translate,
  charges: { readonly root: HTMLElement | null; readonly today: () => CivilDate },
): DocumentReading<TelecomFieldName, TelecomListName> {
  const memory = chargesMemory();
  const show = () => {
    if (charges.root) renderCharges(charges.root, memory.bills(), charges.today(), tr);
  };
  form.addEventListener('reset', () => {
    removeQuotes(form);
    memory.clear();
    show();
  });
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
      memory.add(readBills(extraction));
      show();
      return p;
    },
    wordsEveryCheck: true,
  };
}
