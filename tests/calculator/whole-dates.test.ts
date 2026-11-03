// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { keepDatesWhole, wholeDatesIn, wholeDatesInHtml } from '../../src/scripts/whole-dates';

const W = (d: string) => `<span class="whole-date">${d}</span>`;

describe('wholeDatesInHtml', () => {
  it('wraps every date in the page text', () => {
    expect(wholeDatesInHtml('<h3>Desde el 16-06-2019, lo dice la ley</h3>')).toBe(
      `<h3>Desde el ${W('16-06-2019')}, lo dice la ley</h3>`,
    );
    expect(wholeDatesInHtml('<p>Del 22-03-2026 al 31-05-2026</p>')).toBe(
      `<p>Del ${W('22-03-2026')} al ${W('31-05-2026')}</p>`,
    );
  });

  it('leaves tags, attributes, comments and raw elements as they were', () => {
    const page = [
      '<!doctype html><html><head><title>Antes del 16-06-2019</title>',
      '<meta name="description" content="Desde el 16-06-2019">',
      '<style>.a::after{content:"16-06-2019"}</style>',
      '<script type="application/ld+json">{"d":"<b>16-06-2019</b>"}</script>',
      '<script>const s = "a > 16-06-2019";</script></head>',
      '<body><a title="x > 16-06-2019" href="#a">ir</a><!-- 16-06-2019 --><br/>',
      '<textarea>16-06-2019</textarea><template><p>16-06-2019</p></template>',
    ].join('');
    expect(wholeDatesInHtml(page)).toBe(page);
  });

  it('wraps again the text that follows a raw element', () => {
    expect(wholeDatesInHtml('<script>"16-06-2019"</script><p>16-06-2019</p>')).toBe(
      `<script>"16-06-2019"</script><p>${W('16-06-2019')}</p>`,
    );
  });

  it('leaves longer figures alone', () => {
    const text = '<p>Referencia 116-06-20190 y 2019-06-16</p>';
    expect(wholeDatesInHtml(text)).toBe(text);
  });
});

describe('wholeDatesIn', () => {
  it('wraps the dates of a subtree, once', () => {
    document.body.innerHTML = '<p>Hasta el <b>31-12-2025</b> y el 01-01-2026.</p>';
    wholeDatesIn(document.body);
    wholeDatesIn(document.body);
    expect(document.body.innerHTML).toBe(
      `<p>Hasta el <b>${W('31-12-2025')}</b> y el ${W('01-01-2026')}.</p>`,
    );
    expect(document.body.textContent).toBe('Hasta el 31-12-2025 y el 01-01-2026.');
  });

  it('wraps a date in a lone text node', () => {
    document.body.innerHTML = '<p></p>';
    const p = document.querySelector('p') as HTMLParagraphElement;
    const text = document.createTextNode('el 25-09-2011');
    p.append(text);
    wholeDatesIn(text);
    expect(p.innerHTML).toBe(`el ${W('25-09-2011')}`);
  });
});

describe('keepDatesWhole', () => {
  it('wraps the dates of text written after loading', async () => {
    document.body.innerHTML = '<output></output>';
    keepDatesWhole(document);
    const out = document.querySelector('output') as HTMLOutputElement;
    out.textContent = 'Revisado el 03-11-2026';
    await new Promise((r) => setTimeout(r, 0));
    expect(out.innerHTML).toBe(`Revisado el ${W('03-11-2026')}`);
    (out.querySelector('.whole-date')?.firstChild as Text).data = '04-11-2026';
    await new Promise((r) => setTimeout(r, 0));
    expect(out.textContent).toBe('Revisado el 04-11-2026');
  });
});
