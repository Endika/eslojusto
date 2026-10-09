import type { ExtractedRow, RentalFieldName, RentalListName } from '../documents/contract';
import type { DocumentReading } from '../documents/ports';
import type { Translate } from '../i18n/client';
import { QUOTED, rentalPrefill, type Quoted } from './prefill';
import { ROW_MAX } from './rows';

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

// The rows of an earlier read, then the new read's that are not one of them again.
function together(earlier: readonly ExtractedRow[], read: readonly ExtractedRow[]) {
  const key = (r: ExtractedRow) => JSON.stringify([r.source, r.values]);
  const seen = new Set(earlier.map(key));
  return [...earlier, ...read.filter((r) => !seen.has(key(r)))];
}

// How the rental review takes what was read: its answers, and the clauses quoted beside the
// questions they answer. A new read replaces the quotes it brings; starting over removes them all.
// The receipts and notices of every read since are kept here, in the page, so a later read works
// out the rises and the year's charges from all of them.
export function rentalReading(
  form: HTMLFormElement,
  tr: Translate,
): DocumentReading<RentalFieldName, RentalListName> {
  let earlier: Record<'receipts' | 'notices', readonly ExtractedRow[]> = {
    receipts: [],
    notices: [],
  };
  form.addEventListener('reset', () => {
    for (const quote of form.querySelectorAll('[data-read-quote]')) quote.remove();
    earlier = { receipts: [], notices: [] };
  });
  return {
    prefill(read, answers, checks) {
      const extraction = {
        ...read,
        receipts: together(earlier.receipts, read.receipts),
        notices: together(earlier.notices, read.notices),
      };
      earlier = { receipts: extraction.receipts, notices: extraction.notices };
      const p = rentalPrefill(extraction, answers, tr, checks);
      for (const question of QUOTED) {
        const text = p.quotes[question];
        if (text) showQuote(form, question, text, tr);
      }
      return p;
    },
    // One guarantee, fee or deduction per kind and amount, one rise per year, one charge per
    // concept and year, one deposit return per day and amount.
    lists: {
      guarantees: { identity: ['kind', 'amount'], max: ROW_MAX.guarantees },
      fees: { identity: ['kind', 'amount'], max: ROW_MAX.fees },
      updates: { identity: ['year'], max: ROW_MAX.updates },
      charges: { identity: ['kind', 'year'], max: ROW_MAX.charges },
      returns: { identity: ['on', 'amount'], max: ROW_MAX.returns },
      deductions: { identity: ['kind', 'amount'], max: ROW_MAX.deductions },
    },
  };
}
