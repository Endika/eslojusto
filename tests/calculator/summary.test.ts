// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderSummary, roundToTens, summaryHeadline } from '../../src/calculator/render';
import { completed, tr, unfairDismissal } from '../documents/fixtures';

function result(): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = `
    <section data-summary hidden>
      <p data-summary-headline></p>
      <ul data-summary-lines></ul>
      <p data-summary-counted hidden></p>
      <p data-summary-benefit></p>
      <div data-summary-deadlines></div>
    </section>
    <div data-items data-detail></div>
    <section data-benefit data-detail></section>
    <section data-unchecked-section></section>`;
  return div;
}

function summaryOf(r: ReturnType<typeof completed>) {
  const div = result();
  renderSummary(div, r.review, r.benefit, r.input.cause, tr);
  const text = (sel: string) => div.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  return {
    div,
    headline: text('[data-summary-headline]'),
    lines: [...div.querySelectorAll('[data-summary-lines] li')].map((li) =>
      (li.textContent ?? '').replace(/\s/g, ' '),
    ),
    counted: text('[data-summary-counted]'),
    benefit: text('[data-summary-benefit]'),
    deadlines: [...div.querySelectorAll('[data-summary-deadlines] p')].map((p) => p.textContent),
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
  it('two items short: one line with how many and their sum, rounded once', () => {
    const one = completed(unfairDismissal, { severance: 100, holiday_pay: 1500 }).review;
    const two = completed(unfairDismissal, { severance: 100, holiday_pay: 1 }).review;
    const sum = two.items.reduce(
      (total, p) => total + (p.status === 'below_minimum' ? (p.difference ?? 0) : 0),
      0,
    );
    expect(two.items.filter((p) => p.status === 'below_minimum').length).toBe(2);
    expect(sum).toBeGreaterThan(one.items.reduce((t, p) => t + (p.difference ?? 0), 0));
    const s = summaryOf(completed(unfairDismissal, { severance: 100, holiday_pay: 1 }));
    expect(roundToTens(sum)).toBe(41_830);
    expect(s.lines).toEqual(['2 partidas podrían quedarse cortas: unos 41.830 € en total.']);
  });

  it('under 10 € still says something is missing', () => {
    const r = completed();
    const severance = r.review.items.find((p) => p.item.id === 'severance');
    const min = severance?.item.range?.min ?? 0;
    const s = summaryOf(completed(unfairDismissal, { severance: min - 3 }));
    expect(s.lines).toEqual(['Una partida podría quedarse corta, en menos de 10 €.']);
  });

  it('5 € short is «menos de 10 €», never rounded up to «unos 10 €»', () => {
    const r = completed();
    const severance = r.review.items.find((p) => p.item.id === 'severance');
    const min = severance?.item.range?.min ?? 0;
    const s = summaryOf(completed(unfairDismissal, { severance: min - 5 }));
    expect(s.lines).toEqual(['Una partida podría quedarse corta, en menos de 10 €.']);
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

  it('keeps the holiday days it counted, and one line on the benefit', () => {
    const s = summaryOf(completed());
    expect(s.counted).toBe('Hemos contado 0 días naturales disfrutados de 30 al año.');
    expect(s.benefit).toBe(
      'Esta causa da derecho a paro: unos 1.225 € al mes en bruto los primeros 6 meses, si sumas al menos 360 días cotizados en los últimos 6 años.',
    );
    expect(summaryOf(completed({ ...unfairDismissal, cause: 'resignation' })).benefit).toBe(
      'Una baja voluntaria no da derecho a paro, salvo excepciones como un traslado, una modificación sustancial de tus condiciones que te perjudique, un incumplimiento grave de la empresa o la violencia de género o sexual (art. 267.1.a.5.º LGSS).',
    );
  });
});

describe('the deadlines in the summary', () => {
  it('a dismissal: the 20 days to challenge it and the 15 to ask for the benefit', () => {
    expect(summaryOf(completed()).deadlines).toEqual([
      'El plazo para impugnar un despido es de 20 días hábiles (art. 59.4 ET).',
      'Para cobrar el paro tienes que inscribirte como demandante de empleo y pedirlo en los 15 días siguientes al fin del contrato (hábiles, según el SEPE). Si tu finiquito paga vacaciones no disfrutadas, el plazo cuenta desde que terminan esos días (arts. 266 y 268 LGSS).',
    ]);
  });
  it('the end of a fixed-term contract: only the benefit; a resignation: none', () => {
    const fixedTerm = completed({
      ...unfairDismissal,
      cause: 'fixed_term_end',
      fixedTermType: 'production_circumstances',
    });
    expect(summaryOf(fixedTerm).deadlines).toHaveLength(1);
    expect(summaryOf(fixedTerm).deadlines[0]).toMatch(/^Para cobrar el paro/);
    expect(summaryOf(completed({ ...unfairDismissal, cause: 'resignation' })).deadlines).toEqual(
      [],
    );
  });
  it('«No lo sé»: the 20 days in case it was a dismissal', () => {
    const unknown = completed({ ...unfairDismissal, cause: 'unknown' });
    expect(summaryOf(unknown).deadlines[0]).toBe(
      'Si fue un despido, el plazo para impugnarlo es de 20 días hábiles (art. 59.4 ET).',
    );
  });
});
