// A document's own words under a question, before its choices or its field, with what they are
// and how to read them. Showing it again replaces the earlier one. Folded, only what they are
// shows until opened, so a long clause leaves the sheet and its buttons on a small screen.
export function showQuote(
  form: HTMLFormElement,
  question: string,
  text: string,
  { label, note, folded = false }: { label: string; note: string; folded?: boolean },
): void {
  const box = form.querySelector<HTMLElement>(`[data-field="${question}"]`);
  if (!box) return;
  box.querySelector(':scope > [data-read-quote]')?.remove();
  const figure = document.createElement(folded ? 'details' : 'figure');
  figure.className = folded ? 'read-quote item__detail' : 'read-quote';
  figure.dataset['readQuote'] = question;
  const caption = document.createElement(folded ? 'summary' : 'figcaption');
  caption.className = 'read-quote__label';
  caption.textContent = label;
  const quote = document.createElement('blockquote');
  quote.className = 'read-quote__text';
  quote.textContent = text;
  const remark = document.createElement('p');
  remark.className = 'read-quote__note';
  remark.textContent = note;
  figure.append(caption, quote, remark);
  const choices = box.querySelector(':scope > .options, :scope > .chips, :scope > input');
  if (choices) choices.before(figure);
  else box.append(figure);
}

// Every quote a read left in the form, as starting over removes them.
export function removeQuotes(form: HTMLFormElement): void {
  for (const quote of form.querySelectorAll('[data-read-quote]')) quote.remove();
}
