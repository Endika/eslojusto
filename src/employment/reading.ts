import type { EmploymentFieldName, EmploymentListName } from '../documents/contract';
import type { DocumentReading } from '../documents/ports';
import type { Translate } from '../i18n/client';
import { QUOTED, employmentPrefill, type Quoted } from './prefill';
import { ROW_MAX } from './rows';

// The documents' own words under a question, before its choices, with what they are.
function showQuote(form: HTMLFormElement, question: Quoted, text: string, tr: Translate) {
  const box = form.querySelector<HTMLElement>(`[data-field="${question}"]`);
  if (!box) return;
  box.querySelector(':scope > [data-read-quote]')?.remove();
  const figure = document.createElement('figure');
  figure.className = 'read-quote';
  figure.dataset['readQuote'] = question;
  const caption = document.createElement('figcaption');
  caption.className = 'read-quote__label';
  caption.textContent = tr(`client.employment.documents.quote.${question}`);
  const quote = document.createElement('blockquote');
  quote.className = 'read-quote__text';
  quote.textContent = text;
  const note = document.createElement('p');
  note.className = 'read-quote__note';
  note.textContent = tr('client.employment.documents.quote_note');
  figure.append(caption, quote, note);
  const choices = box.querySelector(':scope > .options, :scope > .chips, :scope > input');
  if (choices) choices.before(figure);
  else box.append(figure);
}

// How the contract review takes what was read: its answers, and the documents' words quoted
// beside the questions they answer. A new read replaces the quotes it brings; starting over
// removes them all.
export function employmentReading(
  form: HTMLFormElement,
  tr: Translate,
): DocumentReading<EmploymentFieldName, EmploymentListName> {
  form.addEventListener('reset', () => {
    for (const quote of form.querySelectorAll('[data-read-quote]')) quote.remove();
  });
  return {
    prefill(extraction, answers, checks) {
      const p = employmentPrefill(extraction, answers, tr, checks);
      for (const question of QUOTED) {
        const text = p.quotes[question];
        if (text) showQuote(form, question, text, tr);
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
