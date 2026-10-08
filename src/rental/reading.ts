import type { RentalFieldName, RentalListName } from '../documents/contract';
import type { DocumentReading } from '../documents/ports';
import type { Translate } from '../i18n/client';
import { QUOTED, rentalPrefill, type Quoted } from './prefill';

// The contract's own words under a question, before its choices, with what they are.
function showQuote(form: HTMLFormElement, question: Quoted, text: string, tr: Translate) {
  const box = form.querySelector<HTMLElement>(`[data-field="${question}"]`);
  if (!box) return;
  box.querySelector(`:scope > [data-read-quote]`)?.remove();
  const figure = document.createElement('figure');
  figure.className = 'read-quote';
  figure.dataset['readQuote'] = question;
  const caption = document.createElement('figcaption');
  caption.className = 'read-quote__label';
  caption.textContent = tr(`client.rental.documents.quote.${question}`);
  const quote = document.createElement('blockquote');
  quote.className = 'read-quote__text';
  quote.textContent = text;
  const note = document.createElement('p');
  note.className = 'read-quote__note';
  note.textContent = tr('client.rental.documents.quote_note');
  figure.append(caption, quote, note);
  const choices = box.querySelector(':scope > .options, :scope > .chips');
  if (choices) choices.before(figure);
  else box.append(figure);
}

// How the rental review takes what was read: its answers, and the clauses quoted beside the
// questions they answer. A new read replaces the quotes it brings; starting over removes them all.
export function rentalReading(
  form: HTMLFormElement,
  tr: Translate,
): DocumentReading<RentalFieldName, RentalListName> {
  form.addEventListener('reset', () => {
    for (const quote of form.querySelectorAll('[data-read-quote]')) quote.remove();
  });
  return {
    prefill(extraction, answers, checks) {
      const p = rentalPrefill(extraction, answers, tr, checks);
      for (const question of QUOTED) {
        const text = p.quotes[question];
        if (text) showQuote(form, question, text, tr);
      }
      return p;
    },
  };
}
