// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { translator } from '../../src/i18n/client';
import { es } from '../../src/i18n/es';
import {
  primaryLanguage,
  suggestedLanguage,
  offerOtherLanguage,
  watchTranslation,
} from '../../src/analytics/language';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('primaryLanguage', () => {
  it('takes the primary subtag of the first language', () => {
    expect(primaryLanguage(['ja-JP', 'es'])).toBe('ja');
    expect(primaryLanguage(['es'])).toBe('es');
    expect(primaryLanguage(['ZH-Hant-TW'])).toBe('zh');
  });
  it('with no languages, or one that is not a tag, it is unknown', () => {
    expect(primaryLanguage([])).toBe('unknown');
    expect(primaryLanguage([''])).toBe('unknown');
    expect(primaryLanguage(['1500'])).toBe('unknown');
    expect(primaryLanguage(['x-klingon'])).toBe('unknown');
  });
});

describe('watchTranslation', () => {
  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.lang = 'es';
    vi.useRealTimers();
  });

  it('reports once, with the language it translates to', async () => {
    const html = document.documentElement;
    html.lang = 'es';
    const reports: string[] = [];
    watchTranslation(html, (i) => reports.push(i));
    html.classList.add('translated-ltr');
    html.lang = 'ja';
    await tick();
    html.lang = 'ko';
    html.className = 'translated-rtl';
    await tick();
    expect(reports).toEqual(['ja']);
  });

  it('does not report other class changes', async () => {
    const html = document.documentElement;
    html.lang = 'es';
    const reports: string[] = [];
    watchTranslation(html, (i) => reports.push(i));
    html.classList.add('js');
    html.dataset['theme'] = 'dark';
    await tick();
    expect(reports).toEqual([]);
  });

  it('if the translator sets the class without changing the language, it reports unknown', async () => {
    vi.useFakeTimers();
    const html = document.documentElement;
    html.lang = 'es';
    const reports: string[] = [];
    watchTranslation(html, (i) => reports.push(i));
    html.classList.add('translated-ltr');
    await vi.advanceTimersByTimeAsync(0);
    expect(reports).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(reports).toEqual(['unknown']);
  });
});

const others = [{ code: 'ar-test', name: 'Pseudo RTL', url: '/ar-test/finiquito/' }] as const;

describe('suggestedLanguage', () => {
  it("suggests a published language matching the browser's", () => {
    expect(suggestedLanguage(['ar-EG', 'es'], others, 'es')?.code).toBe('ar-test');
  });
  it('nothing if the browser is already in Spanish, nothing matches, or the page is not in Spanish', () => {
    expect(suggestedLanguage(['es-ES', 'ar'], others, 'es')).toBeNull();
    expect(suggestedLanguage(['ja-JP'], others, 'es')).toBeNull();
    expect(suggestedLanguage(['ar'], [], 'es')).toBeNull();
    expect(suggestedLanguage(['ar'], others, 'ar-test')).toBeNull();
  });
});

describe('the «Esta página también está en …» bar', () => {
  const tr = translator(es);
  const setUp = () => {
    document.body.innerHTML = `<div class="ground"></div><script id="other-languages" type="application/json">${JSON.stringify(others)}</script>`;
    document.documentElement.lang = 'es';
  };
  it('shows with the dictionary strings and a link, without redirecting', () => {
    setUp();
    offerOtherLanguage(document, ['ar-SA'], tr);
    const bar = document.querySelector('.other-language');
    expect(bar?.textContent).toContain('Esta página también está en');
    const a = bar?.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/ar-test/finiquito/');
    expect(a?.getAttribute('hreflang')).toBe('ar-test');
    expect(a?.textContent).toBe('Pseudo RTL');
    expect(bar?.querySelector('button')?.getAttribute('aria-label')).toBe(
      es['client.other_language.close'],
    );
  });
  it('the close button carries a drawn icon, no glyph', () => {
    setUp();
    offerOtherLanguage(document, ['ar'], tr);
    const button = document.querySelector('.other-language button');
    expect(button?.textContent).toBe('');
    expect(button?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(button?.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
  });

  it('closes without storing anything', () => {
    setUp();
    localStorage.clear();
    sessionStorage.clear();
    offerOtherLanguage(document, ['ar'], tr);
    document.querySelector<HTMLButtonElement>('.other-language button')?.click();
    expect(document.querySelector('.other-language')).toBeNull();
    expect([localStorage.length, sessionStorage.length]).toEqual([0, 0]);
  });

  it.each(['javascript:alert(1)', 'https://other.example/finiquito/', '//other.example/x'])(
    'never links off the site: %s',
    (url) => {
      document.body.innerHTML = `<div class="ground"></div><script id="other-languages" type="application/json">${JSON.stringify(others.map((o) => ({ ...o, url })))}</script>`;
      document.documentElement.lang = 'es';
      offerOtherLanguage(document, ['ar'], tr);
      expect(document.querySelector('.other-language')).toBeNull();
    },
  );

  it('does not show without alternative languages, which is what the site publishes today', () => {
    document.body.innerHTML = '<div class="ground"></div>';
    offerOtherLanguage(document, ['ar'], tr);
    expect(document.querySelector('.other-language')).toBeNull();
  });
});
