// A dd-mm-yyyy date never breaks at its hyphens on a narrow screen: each one sits in a span that
// does not wrap, so the text keeps plain hyphens for search, copy and crawlers.
// Bounded by digits only: a Basque suffix («31-12-2027ra») is still a date.
const DATE = /(?<!\d)\d{2}-\d{2}-\d{4}(?!\d)/g;
export const WHOLE_DATE_CLASS = 'whole-date';

// Text inside these elements is never shown as page text, or must stay byte for byte.
const RAW = new Set(['script', 'style', 'title', 'textarea', 'template']);

// A tag, a comment or a doctype, with quoted attribute values that may hold a ">".
const MARKUP = /<!--[\s\S]*?-->|<![^>]*>|<\/?[a-zA-Z][^"'>]*(?:(?:"[^"]*"|'[^']*')[^"'>]*)*>/g;

const wrap = (text: string) =>
  text.replace(DATE, (date) => `<span class="${WHOLE_DATE_CLASS}">${date}</span>`);

// The built page with every date in its text wrapped; tags, attributes and raw elements untouched.
export function wholeDatesInHtml(html: string): string {
  let out = '';
  let last = 0;
  let raw: string | null = null;
  for (const m of html.matchAll(MARKUP)) {
    const text = html.slice(last, m.index);
    out += raw ? text : wrap(text);
    out += m[0];
    last = m.index + m[0].length;
    const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(m[0]);
    if (!tag) continue;
    const name = (tag[2] ?? '').toLowerCase();
    if (raw && tag[1] && name === raw) raw = null;
    else if (!raw && !tag[1] && RAW.has(name) && !m[0].endsWith('/>')) raw = name;
  }
  const rest = html.slice(last);
  return out + (raw ? rest : wrap(rest));
}

// The same for text the page writes after loading, such as a review's result.
export function wholeDatesIn(root: Node): void {
  const doc = root.ownerDocument ?? (root as Document);
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const found: Text[] = [];
  const first = root.nodeType === Node.TEXT_NODE ? root : walker.nextNode();
  for (let n = first; n; n = walker.nextNode()) {
    const parent = n.parentElement;
    if (!parent || RAW.has(parent.localName) || parent.classList.contains(WHOLE_DATE_CLASS))
      continue;
    if ((n as Text).data.search(DATE) >= 0) found.push(n as Text);
  }
  for (const node of found) {
    const parts: Node[] = [];
    let last = 0;
    for (const m of node.data.matchAll(DATE)) {
      if (m.index > last) parts.push(doc.createTextNode(node.data.slice(last, m.index)));
      const span = doc.createElement('span');
      span.className = WHOLE_DATE_CLASS;
      span.textContent = m[0];
      parts.push(span);
      last = m.index + m[0].length;
    }
    if (last < node.data.length) parts.push(doc.createTextNode(node.data.slice(last)));
    node.replaceWith(...parts);
  }
}

export function keepDatesWhole(doc: Document): void {
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') {
        if (r.target.parentNode) wholeDatesIn(r.target.parentNode);
      } else r.addedNodes.forEach((n) => wholeDatesIn(n));
    }
  }).observe(doc.body, { childList: true, subtree: true, characterData: true });
}
