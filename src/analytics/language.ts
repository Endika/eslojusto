import type { Translate } from '../i18n/client';

// The primary subtag of a BCP 47 tag ('ja-JP' → 'ja'); anything else is 'unknown'.
export function primaryLanguage(langs: readonly string[]): string {
  const primary = (langs[0] ?? '').split('-')[0]?.toLowerCase() ?? '';
  return /^[a-z]{2,3}$/.test(primary) ? primary : 'unknown';
}

const TRANSLATED = /\btranslated-(?:ltr|rtl)\b/;
// A translator that marks the page without changing its language still counts, once this passes.
const LANGUAGE_WAIT_MS = 1500;

// Browser translators (Chrome, Edge, Google Translate) add `translated-ltr|rtl` to <html> and
// set its `lang` to the target language. Reports that language once, then stops watching.
export function watchTranslation(html: HTMLElement, onTranslate: (lang: string) => void): void {
  const original = html.lang;
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const report = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    observer.disconnect();
    onTranslate(html.lang === original ? 'unknown' : primaryLanguage([html.lang]));
  };
  const observer = new MutationObserver(() => {
    if (html.lang !== original) report();
    else if (TRANSLATED.test(html.className) && timer === undefined)
      timer = setTimeout(report, LANGUAGE_WAIT_MS);
  });
  observer.observe(html, { attributes: true, attributeFilter: ['class', 'lang'] });
}

const SVG = 'http://www.w3.org/2000/svg';

function closeIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  const attributes = { viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' };
  for (const [k, v] of Object.entries(attributes)) svg.setAttribute(k, v);
  const stroke = doc.createElementNS(SVG, 'path');
  stroke.setAttribute('d', 'M6 6l12 12M18 6 6 18');
  svg.append(stroke);
  return svg;
}

export interface OtherLanguage {
  readonly code: string;
  readonly name: string;
  readonly url: string;
}

// Another published language of this page that matches the browser's, for a visitor on Spanish.
export function suggestedLanguage(
  browserLanguages: readonly string[],
  others: readonly OtherLanguage[],
  current: string,
): OtherLanguage | null {
  const theirs = primaryLanguage(browserLanguages);
  if (current !== 'es' || theirs === 'es') return null;
  return others.find((o) => primaryLanguage([o.code]) === theirs) ?? null;
}

// Offers the page in the browser's language, if it is published; it never redirects. Closing
// it lasts for this page view: nothing is stored.
export function offerOtherLanguage(
  doc: Document,
  browserLanguages: readonly string[],
  tr: Translate,
): void {
  const data = doc.getElementById('other-languages')?.textContent;
  if (!data) return;
  const suggested = suggestedLanguage(
    browserLanguages,
    JSON.parse(data) as OtherLanguage[],
    doc.documentElement.lang,
  );
  if (!suggested) return;
  const target = new URL(suggested.url, doc.location.href);
  if (target.origin !== doc.location.origin) return;

  const bar = doc.createElement('aside');
  bar.className = 'other-language';
  bar.setAttribute('aria-label', tr('client.other_language.aria'));
  const text = doc.createElement('p');
  const link = doc.createElement('a');
  link.href = target.pathname;
  link.hreflang = suggested.code;
  link.lang = suggested.code;
  link.textContent = suggested.name;
  const [before = '', after = ''] = tr('client.other_language.text').split('{idioma}');
  text.append(before, link, after);
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'other-language__close';
  close.setAttribute('aria-label', tr('client.other_language.close'));
  close.append(closeIcon(doc));
  close.addEventListener('click', () => bar.remove());
  bar.append(text, close);
  (doc.querySelector('.ground') ?? doc.body).prepend(bar);
}
