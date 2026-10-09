import type { EmploymentFieldName, EmploymentListName } from '../documents/contract';
import type { DocumentReading } from '../documents/ports';
import { removeQuotes, showQuote } from '../documents/quote';
import type { Translate } from '../i18n/client';
import { QUOTED, employmentPrefill } from './prefill';
import { ROW_MAX } from './rows';

// How the contract review takes what was read: its answers, and the documents' words quoted
// beside the questions they answer. A new read replaces the quotes it brings; starting over
// removes them all.
export function employmentReading(
  form: HTMLFormElement,
  tr: Translate,
): DocumentReading<EmploymentFieldName, EmploymentListName> {
  form.addEventListener('reset', () => removeQuotes(form));
  return {
    prefill(extraction, answers, checks) {
      const p = employmentPrefill(extraction, answers, tr, checks);
      for (const question of QUOTED) {
        const text = p.quotes[question];
        if (text)
          showQuote(form, question, text, {
            label: tr(`client.employment.documents.quote.${question}`),
            note: tr('client.employment.documents.quote_note'),
          });
      }
      return p;
    },
    wordsEveryCheck: true,
    // One contract per start date, one payslip per month, one salary part per kind and one clause
    // per label.
    lists: {
      history: { identity: ['startDate'], max: ROW_MAX.history },
      parts: { identity: ['kind'], max: ROW_MAX.parts },
      payslips: { identity: ['month'], max: ROW_MAX.payslips },
      clauses: { identity: ['label'], max: ROW_MAX.clauses },
    },
  };
}
