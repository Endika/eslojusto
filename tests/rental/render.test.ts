// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  dependsPieces,
  reasonsText,
  renderOutOfScope,
  renderRentalResult,
  verdictPieces,
} from '../../src/rental/render';
import { summarise } from '../../src/rental/summary';
import { parseDate as f } from '../../src/engine/date';
import {
  contract,
  repealedWindow,
  review,
  riseAboveIrav,
  tr,
  unknownLargeLandlord,
} from './fixtures';
import type { RentalInput } from '../../src/engine/rental/types';

// The result's hooks and templates, as RentalResult.astro has them.
function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
    </section>
    <section data-in-scope data-summary><p data-headline></p><ul data-totals></ul></section>
    <div data-items></div>
    <section data-in-scope><div data-information></div></section>
    <section data-in-scope><ul data-unchecked></ul></section>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span><h3 data-title></h3>
        <p class="item__status"><svg data-mark><use href="#x"></use></svg><span data-status-text></span></p>
        <p data-depends hidden></p><p data-total-share hidden></p><p data-hint hidden></p>
        <ul data-rules></ul><div data-detail-slot></div>
      </section>
    </template>
    <template data-template="rule"><li><a></a><span data-rule-status></span></li></template>
    <template data-template="detail">
      <details data-detail><div data-readings></div><ul data-sources></ul></details>
    </template>
    <template data-template="reading">
      <div><h4 data-reading-title></h4><dl data-figures></dl><ol data-calculation></ol></div>
    </template>
    <template data-template="figure"><div><dt></dt><dd></dd></div></template>
    <template data-template="source"><li><a></a><span data-in-force></span></li></template>
    <template data-template="information">
      <details><summary data-info-title></summary><p data-info-text></p><ul data-info-links></ul></details>
    </template>`;
  return root;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

const render = (input: RentalInput, locked: boolean) => {
  const root = result();
  renderRentalResult(root, { review: review(input), input }, locked, tr);
  return root;
};

const firstRise = (input: RentalInput) => {
  const item = review(input).items.find((i) => i.kind === 'rent_update');
  if (!item) throw new Error('no rise');
  return item;
};

describe('the summary of an item', () => {
  it('rounds what is paid over to tens', () => {
    const el = document.createElement('p');
    el.replaceChildren(...verdictPieces({ status: 'paid_over', amount: 110.4 }, tr));
    expect(text(el)).toBe('Pagas de más: unos 110 €');
    el.replaceChildren(...verdictPieces({ status: 'owed', amount: 4.1 }, tr));
    expect(text(el)).toBe('Te deben menos de 10 €');
  });

  const dependsText = (input: RentalInput) => {
    const s = summarise(firstRise(input));
    if (s.kind !== 'depends') throw new Error('expected depends');
    const el = document.createElement('p');
    el.replaceChildren(...dependsPieces(s, tr));
    return text(el);
  };

  it('words a reading with no figure by its result, never as «0 €»', () => {
    expect(dependsText(unknownLargeLandlord)).toBe(
      'Depende de si tu casero es gran tenedor: no se puede comprobar o pagas de más unos 360 €',
    );
  });

  it('gives a range when both readings have a figure: within the limit is 0 €', () => {
    expect(dependsText(repealedWindow)).toMatch(
      /^Depende de cómo se lea una norma que ya está derogada: entre 0 € y \d+ €$/,
    );
  });

  it('keeps the cents where tens would make the two readings, the share and the total alike', () => {
    // Keys back on 31-05-2024 and the whole 800 € deposit returned on 01-03-2025: the interest
    // differs by cents with the length of the year.
    const input = contract({
      initialRent: 800,
      deposit: 800,
      signedOn: f('2021-03-15'),
      startDate: f('2021-03-20'),
      moveOut: {
        keysReturnedOn: f('2024-05-31'),
        returns: [{ on: f('2025-03-01'), amount: 800 }],
        deductions: [],
      },
    });
    const root = render(input, true);
    const card = root.querySelector('[data-item="deposit_interest"]');
    const depends = text(card?.querySelector('[data-depends]'));
    const range = /entre ([\d.,]+ €) y ([\d.,]+ €)/.exec(depends);
    expect(range?.[1]).toMatch(/,\d\d €$/);
    expect(range?.[2]).toMatch(/,\d\d €$/);
    expect(text(card?.querySelector('[data-total-share]'))).toBe(
      `Al total se suma solo la cuenta más baja: ${range?.[1]}.`,
    );
    expect(text(root.querySelector('[data-totals]'))).toContain(`al menos ${range?.[1]}`);
  });

  it('joins several reasons in one sentence', () => {
    expect(reasonsText(['repealed_window', 'agreement_unknown', 'interest_day_count'], tr)).toBe(
      'cómo se lea una norma que ya está derogada, de si lo pactasteis por escrito y de si el año de intereses cuenta 365 días o 360',
    );
  });
});

describe('the calculation text', () => {
  it('writes a year as it is and counts one month in the singular', () => {
    const root = render(
      contract({
        signedOn: f('2024-03-15'),
        startDate: f('2024-03-20'),
        updates: [
          {
            anniversary: f('2025-03-20'),
            effectiveOn: f('2025-03-20'),
            previousRent: 1000,
            newRent: 1030,
            chargedFrom: f('2025-03-01'),
            notice: 'letter',
            noticeOn: f('2025-03-01'),
            agreedInWriting: false,
          },
        ],
        charges: [
          {
            kind: 'community',
            inContract: true,
            annualAgreed: 600,
            charged: [{ year: 2025, amount: 700 }],
          },
        ],
      }),
      false,
    );
    const detail = text(root);
    expect(detail).toContain('Se cobró 1 mes con la renta nueva antes del mes siguiente');
    expect(detail).toMatch(/En 2025 la renta podía subir/);
    expect(detail).not.toMatch(/2\.025/);
  });
});

describe('the result', () => {
  it('shows each rule with its norm, link and status', () => {
    const root = render(repealedWindow, true);
    const card = root.querySelector('[data-item="rent_update"]');
    expect(card?.getAttribute('data-state')).toBe('depends');
    expect(text(card?.querySelector('[data-total-share]'))).toContain('No se suma al total');
    const statuses = [...(card?.querySelectorAll('[data-rule-status]') ?? [])].map(text);
    expect(statuses).toContain('derogada el 30-04-2026');
    const links = [...(card?.querySelectorAll('[data-rules] a') ?? [])];
    expect(links.some((a) => a.getAttribute('href')?.startsWith('https://www.boe.es/'))).toBe(true);
  });

  it('counts the total as «al menos …»', () => {
    const root = render(riseAboveIrav, true);
    expect(text(root.querySelector('[data-totals]'))).toBe(
      'Pagas o has pagado de más al menos unos 110 €.',
    );
  });

  it('locked, the detail is not in the page at all', () => {
    const root = render(riseAboveIrav, true);
    expect(root.querySelector('[data-detail]')).toBeNull();
    expect(root.querySelector('[data-information] details')).not.toBeNull();
    expect(root.querySelectorAll('[data-unchecked] li')).toHaveLength(5);
  });

  it('unlocked, each rise shows its index, month, publication day and cap', () => {
    const root = render(riseAboveIrav, false);
    const detail = text(root.querySelector('[data-item="rent_update"] [data-detail]'));
    expect(detail).toContain('IRAV de febrero de 2025: 2,08 %, publicado el 14-03-2025');
    expect(detail).toContain('Tope legal');
    expect(detail).toContain('con efectos desde el 01-01-2025 · en vigor');
  });

  it('out of scope, it says why and works nothing out', () => {
    const root = render(riseAboveIrav, true);
    renderOutOfScope(root, 'before_2019', tr);
    expect(root.querySelector<HTMLElement>('[data-out-of-scope]')?.hidden).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-summary]')?.hidden).toBe(true);
    expect(root.querySelector('[data-items]')?.children).toHaveLength(0);
    expect(text(root.querySelector('[data-out-of-scope-reason]'))).toContain(
      'Esta versión no revisa contratos firmados antes del 6 de marzo de 2019',
    );
  });
});
