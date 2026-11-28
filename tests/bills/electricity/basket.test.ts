// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderBasket } from '../../../src/bills/electricity/basket';
import type { CompletedElectricityReview } from '../../../src/bills/electricity/ports';
import { single } from '../../../src/engine/bills/finding';
import type { Translate } from '../../../src/i18n/client';
import { juneBill } from '../../engine/bills/input';
import { entryWith, finding } from './support';

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);

function box(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <section data-basket hidden>
      <h3 data-basket-title></h3><ul data-basket-bills></ul>
      <div data-basket-year hidden>
        <p data-basket-counted></p><p data-basket-up-to hidden></p>
        <p data-basket-under hidden></p><p data-basket-recurring hidden></p>
        <p data-basket-estimate hidden></p>
      </div>
      <button data-basket-next hidden></button>
    </section>`;
  return root;
}

function part(root: HTMLElement, name: string): HTMLElement {
  const el = root.querySelector<HTMLElement>(`[data-basket${name ? `-${name}` : ''}]`);
  if (!el) throw new Error(`No ${name} part`);
  return el;
}

function render(
  entries: CompletedElectricityReview[],
  { pending = 0, locked = false } = {},
): HTMLElement {
  const root = box();
  renderBasket(root, entries, pending, locked, tr);
  return root;
}

// Bills of 30 days each, one after the other.
const june = juneBill();
const july = { readingFrom: june.readingTo, readingTo: june.dueOn };

describe('the basket of «tu año»', () => {
  it('shows only with a bill or one waiting, and says how many wait', () => {
    expect(part(render([]), '').hidden).toBe(true);
    expect(part(render([entryWith([])]), '').hidden).toBe(false);
    const waiting1 = render([], { pending: 1 });
    expect(part(waiting1, '').hidden).toBe(false);
    expect(part(waiting1, 'next').hidden).toBe(false);
    expect(part(waiting1, 'next').textContent).toBe('client.bills.basket.next_one');
    expect(part(render([], { pending: 2 }), 'next').textContent).toBe(
      'client.bills.basket.next_many {"n":2}',
    );
    expect(part(render([entryWith([])]), 'next').hidden).toBe(true);
  });

  it('titles the basket with the bills that count', () => {
    expect(part(render([]), 'title').textContent).toBe('client.bills.basket.title_many {"n":0}');
    expect(part(render([entryWith([])]), 'title').textContent).toBe(
      'client.bills.basket.title_one',
    );
    expect(part(render([entryWith([]), entryWith([], july)]), 'title').textContent).toBe(
      'client.bills.basket.title_many {"n":2}',
    );
  });

  it('lists each bill with what it counts, and a copy of one as a copy', () => {
    const root = render([
      entryWith([], {}, { counted: 1.5 }),
      entryWith([], {}, { counted: 1.5 }),
      entryWith([], july, { counted: 2 }),
    ]);
    const items = [...root.querySelectorAll('[data-basket-bills] li')].map((li) => li.textContent);
    expect(items).toEqual([
      expect.stringMatching(
        /^client\.bills\.basket\.bill_counted \{"factura":".*","importe":"1,50/,
      ),
      expect.stringMatching(/^client\.bills\.basket\.bill_duplicate \{"factura":".*"\}$/),
      expect.stringMatching(/^client\.bills\.basket\.bill_counted \{.*"importe":"2,00/),
    ]);
  });

  it('lists a bill outside the review as one that counts nothing, not as a copy', () => {
    const out = entryWith([], {}, { counted: 0 });
    const outside = {
      ...out,
      review: { ...out.review, scope: { inScope: false, reason: 'over_15kw' } },
    } as CompletedElectricityReview;
    const root = render([entryWith([]), outside]);
    expect(
      [...root.querySelectorAll('[data-basket-bills] li')].map((li) => li.textContent)[1],
    ).toMatch(/^client\.bills\.basket\.bill_counted/);
  });

  it('adds the year up only from two bills that count', () => {
    expect(part(render([entryWith([])]), 'year').hidden).toBe(true);
    const two = render([entryWith([], {}, { counted: 1 }), entryWith([], july, { counted: 2 })]);
    expect(part(two, 'year').hidden).toBe(false);
    expect(part(two, 'counted').textContent).toMatch(/^3,00\s€$/);
  });

  it('says what could come to more, and what is charged short, only when there is some', () => {
    const none = render([
      entryWith([], {}, { counted: 1, upTo: 1, under: 0 }),
      entryWith([], july),
    ]);
    expect(part(none, 'up-to').hidden).toBe(true);
    expect(part(none, 'under').hidden).toBe(true);
    const some = render([
      entryWith([], {}, { counted: 1, upTo: 2, under: 0.5 }),
      entryWith([], july, { counted: 1, upTo: 2, under: 0.5 }),
    ]);
    expect(part(some, 'up-to').hidden).toBe(false);
    expect(part(some, 'up-to').textContent).toMatch(
      /^client\.bills\.total\.up_to \{"importe":"4,00/,
    );
    expect(part(some, 'under').hidden).toBe(false);
    expect(part(some, 'under').textContent).toMatch(
      /^client\.bills\.total\.under \{"importe":"1,00/,
    );
  });

  describe('what repeats', () => {
    const repeating = [
      entryWith([single(finding('vat', 3)), single(finding('meter', 1))]),
      entryWith([single(finding('vat', 3)), single(finding('meter', 1))], july),
    ];

    it('names the lines that come back in more than one bill, and the estimate for a year', () => {
      const root = render(repeating);
      expect(part(root, 'recurring').hidden).toBe(false);
      expect(part(root, 'recurring').textContent).toBe(
        'client.bills.basket.recurring {"partidas":"client.bills.item.vat, client.bills.item.meter"}',
      );
      expect(part(root, 'estimate').hidden).toBe(false);
      expect(part(root, 'estimate').textContent).toMatch(
        /^client\.bills\.basket\.estimate \{"partidas":"client\.bills\.item\.vat, client\.bills\.item\.meter","importe":"\d/,
      );
    });

    it('names none of them when the year is locked with the pass offered', () => {
      const root = render(repeating, { locked: true });
      expect(part(root, 'recurring').textContent).toBe('client.bills.basket.recurring_unnamed');
      expect(part(root, 'estimate').textContent).toMatch(
        /^client\.bills\.basket\.estimate_unnamed \{"importe":"\d/,
      );
    });

    it('says nothing of what repeats when nothing does', () => {
      const root = render([
        entryWith([single(finding('vat', 3))]),
        entryWith([single(finding('meter', 1))], july),
      ]);
      expect(part(root, 'recurring').hidden).toBe(true);
      expect(part(root, 'estimate').hidden).toBe(true);
      expect(part(root, 'estimate').textContent).toBe('');
    });
  });
});
