// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  renderResult,
  renderSummary,
  roundToTens,
  summaryHeadline,
} from '../../src/calculator/render';
import { completed, tr, unfairDismissal } from '../documents/fixtures';

function result(): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = `
    <section data-summary hidden>
      <p data-summary-headline></p>
      <ul data-summary-lines></ul>
      <p data-summary-counted hidden></p>
      <p data-summary-benefit></p>
    </section>
    <div data-items data-detail></div>
    <section data-benefit data-detail></section>
    <section data-unchecked-section></section>`;
  return div;
}

function summaryOf(r: ReturnType<typeof completed>) {
  const div = result();
  renderSummary(div, r.review, r.benefit, tr);
  const text = (sel: string) => div.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  return {
    div,
    headline: text('[data-summary-headline]'),
    lines: [...div.querySelectorAll('[data-summary-lines] li')].map((li) =>
      (li.textContent ?? '').replace(/\s/g, ' '),
    ),
    counted: text('[data-summary-counted]'),
    benefit: text('[data-summary-benefit]'),
  };
}

describe('the amount in the summary', () => {
  it('rounds to the nearest 10 €', () => {
    expect([438.41, 434.99, 435, 1294.9, 4.99, 5].map(roundToTens)).toEqual([
      440, 430, 440, 1290, 0, 10,
    ]);
  });
});

describe('the summary before the pass', () => {
  it('with a shortfall: only the item and roughly how much, never a range or a method', () => {
    const s = summaryOf(completed());
    expect(summaryHeadline(completed().review)).toBe('shortfall');
    expect(s.headline).toBe(
      'Con las cifras que has metido, a tu finiquito le podría faltar dinero:',
    );
    expect(s.lines).toContain('Indemnización: podrían faltarte unos 440 €.');
    const all = s.div.querySelector('[data-summary]')?.textContent ?? '';
    expect(all).not.toMatch(/entre .* y /);
    expect(all).not.toContain('ET');
    expect(all).not.toContain('Cómo se calcula');
  });

  it('under 10 € still says something is missing', () => {
    const r = completed();
    const severance = r.review.items.find((p) => p.item.id === 'severance');
    const min = severance?.item.range?.min ?? 0;
    const s = summaryOf(completed(unfairDismissal, { severance: min - 3 }));
    expect(s.lines).toEqual(['Indemnización: podrían faltarte menos de 10 €.']);
  });

  it('a deduction above its maximum reads as such', () => {
    const s = summaryOf(
      completed(
        { ...unfairDismissal, cause: 'resignation', agreementNoticeDays: 15, noticeDaysGiven: 0 },
        { notice_deduction: 5000 },
      ),
    );
    expect(
      s.lines.some((l) =>
        /^Descuento por preaviso no cumplido: el descuento podría pasarse en unos [\d.]+0 €\.$/.test(
          l,
        ),
      ),
    ).toBe(true);
  });

  it('with every item at its minimum: it matches, with no line and no offer to buy', () => {
    const minimums = Object.fromEntries(
      completed(unfairDismissal, {}).review.items.map((p) => [p.item.id, p.item.range?.min ?? 0]),
    );
    const r = completed(unfairDismissal, minimums);
    expect(summaryHeadline(r.review)).toBe('all_match');
    const s = summaryOf(r);
    expect(s.headline).toBe(
      'Tu finiquito coincide con el mínimo legal en todas las partidas que se pueden comprobar.',
    );
    expect(s.lines).toEqual([]);
  });

  it('without the employer figures there is nothing to compare', () => {
    expect(summaryOf(completed(unfairDismissal, {})).headline).toMatch(
      /^Sin las cifras de tu finiquito no hay nada que comparar/,
    );
    expect(summaryHeadline(completed(unfairDismissal, { severance: 50000 }).review)).toBe(
      'nothing_short',
    );
  });

  it('keeps the holiday days it counted, and one line on the benefit', () => {
    const s = summaryOf(completed());
    expect(s.counted).toBe('Hemos contado 0 días naturales disfrutados de 30 al año.');
    expect(s.benefit).toMatch(
      /^Esta causa da derecho a paro: unos [\d.]+0 € al mes en bruto los primeros 6 meses, si sumas al menos 360 días cotizados en los últimos 6 años\.$/,
    );
    expect(summaryOf(completed({ ...unfairDismissal, cause: 'resignation' })).benefit).toBe(
      'Esta causa no da derecho a paro.',
    );
  });
});

// The result as FinalPayResult.astro lays it out: the detail only in its templates.
function page(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead>Una hoja por partida</p>
    <div data-review>
      <section data-summary hidden>
        <p data-summary-headline></p><ul data-summary-lines></ul>
        <p data-summary-counted hidden></p><p data-summary-benefit></p>
      </section>
      <div data-items></div>
      <div data-slot="benefit"></div>
      <ul data-unchecked></ul>
      <div data-slot="proposal"></div>
      <template data-template="benefit">
        <section data-benefit>
          <p><svg data-benefit-mark><use></use></svg><span data-benefit-status-text></span></p>
          <p data-benefit-reason></p><p data-benefit-no>just cause</p>
          <div data-benefit-yes>
            <p data-benefit-amount></p><p data-benefit-full-time>full time</p>
            <p data-benefit-children-unknown hidden></p><p data-benefit-deduction></p>
            <p data-benefit-duration></p><p data-benefit-duration-note></p>
            <p data-benefit-qualifying></p>
          </div>
          <details><summary>Cómo se calcula</summary><ul data-benefit-sources></ul></details>
        </section>
      </template>
      <template data-template="proposal">
        <section><a href="https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430#a49">art. 49</a></section>
      </template>
      <template data-template="item">
        <section data-item>
          <span data-tab-number></span><h3 data-title></h3>
          <p><svg data-mark><use></use></svg><span data-status-text></span></p>
          <p data-citation hidden></p>
          <dl data-figures><dt data-range-label></dt><dd data-range></dd><dd data-employer></dd></dl>
          <p data-counted hidden></p><p data-based-on hidden></p>
          <p data-agreement hidden>agreement</p><p data-reference hidden></p>
          <details data-detail><summary>Cómo se calcula</summary>
            <p data-calculation></p><ul data-sources></ul></details>
        </section>
      </template>
      <template data-template="source">
        <li><a></a><span data-in-force hidden></span></li>
      </template>
    </div>`;
  return root;
}

const data = (r: ReturnType<typeof completed>) => ({
  review: r.review,
  benefit: r.benefit,
  cause: r.input.cause,
  children: 0 as const,
});

describe('locked and unlocked result', () => {
  it('locked, the page holds no detail at all: no calculation, no source, no range', () => {
    const root = page();
    const r = completed({ ...unfairDismissal, cause: 'objective_dismissal' }, { severance: 100 });
    renderResult(root, data(r), true, tr);
    const text = root.textContent ?? '';
    expect(text).toContain('Indemnización: podrían faltarte');
    for (const detail of [
      'Cómo se calcula',
      'días devengados',
      'meses ×',
      'Mínimo legal',
      'Referencia',
      'en vigor desde',
      'Estatuto de los Trabajadores',
      'entre ',
    ])
      expect(text).not.toContain(detail);
    expect(root.querySelectorAll('a[href*="boe.es"]')).toHaveLength(0);
    expect(root.querySelectorAll('[data-item], [data-benefit], [data-range]')).toHaveLength(0);
    expect(root.querySelector<HTMLElement>('[data-lead]')?.hidden).toBe(true);
  });

  it('unlocked, the detail is cloned in and filled; locked again, it is taken out', () => {
    const root = page();
    const d = data(completed());
    renderResult(root, d, false, tr);
    expect(root.querySelector<HTMLElement>('[data-summary]')?.hidden).toBe(true);
    expect(root.querySelectorAll('[data-item]').length).toBeGreaterThan(2);
    expect(root.textContent).toContain('Cómo se calcula');
    expect(root.querySelector('a[href*="boe.es"]')).not.toBeNull();
    expect(root.querySelector('[data-benefit-status-text]')?.textContent).not.toBe('');
    renderResult(root, d, true, tr);
    expect(root.querySelectorAll('[data-item], [data-benefit], a[href*="boe.es"]')).toHaveLength(0);
  });
});
