// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pickArm, revealSteps, stageReveal } from '../../src/calculator/reveal';
import { reviewFinalPay } from '../../src/engine/review';
import type { FinalPayInput } from '../../src/engine/types';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';

const tr = ((key, vars) => t('es', key, vars)) as Translate;

const dismissal: FinalPayInput = {
  cause: 'objective_dismissal',
  startDate: { y: 2022, m: 1, d: 10 },
  endDate: { y: 2026, m: 9, d: 15 },
  monthlySalary: 1850,
  extraPayProrated: true,
  extraPayCount: 2,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};

const review = () => {
  const r = reviewFinalPay(dismissal, {}, { y: 2026, m: 10, d: 6 });
  if (!r.ok) throw new Error('invalid input');
  return r.review;
};

function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <header><h2 id="result-title">Tu resultado</h2></header>
    <div data-reveal hidden>
      <ol data-reveal-steps aria-hidden="true"></ol>
      <p data-reveal-summary role="status"></p>
    </div>
    <div data-review></div>`;
  return root;
}

const steps = (root: HTMLElement) =>
  [...root.querySelectorAll('[data-reveal-steps] li')].map((li) => li.textContent);

describe('which half of the comparison a page view falls in', () => {
  it('splits at one half, and leaves reduced motion out of it', () => {
    expect(pickArm(0.1, false)).toBe('staged');
    expect(pickArm(0.5, false)).toBe('instant');
    expect(pickArm(0.1, true)).toBe('reduced');
  });
});

describe('the checks the sequence shows', () => {
  it('names every item the review compared and counts its legal references', () => {
    const r = review();
    const s = revealSteps(r, tr);
    expect(s.lines).toHaveLength(r.items.length);
    expect(s.lines).toContain('Comprobado con la ley: Indemnización');
    const references = new Set(r.items.flatMap((i) => i.item.sources.map((x) => x.citation)));
    expect(s.summary).toBe(
      `Partidas comprobadas: ${r.items.length}. Referencias legales: ${references.size}.`,
    );
  });
});

describe('what the sequence never claims', () => {
  it('leaves out an item without a figure: it was not checked', () => {
    const r = review();
    const unchecked = {
      ...r,
      items: r.items.map((x) =>
        x.item.id === 'severance' ? { ...x, item: { ...x.item, range: null } } : x,
      ),
    };
    const s = revealSteps(unchecked, tr);
    expect(s.lines).toHaveLength(r.items.length - 1);
    expect(s.lines).not.toContain('Comprobado con la ley: Indemnización');
    expect(s.summary).toMatch(new RegExp(`^Partidas comprobadas: ${r.items.length - 1}\\.`));
  });
});

describe('the sequence', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('hides the result, shows the checks one by one, then the result, in under 3 seconds', () => {
    const root = result();
    const s = revealSteps(review(), tr);
    const done = vi.fn();
    stageReveal(root, s, false, done);
    expect(root.hasAttribute('data-revealing')).toBe(true);
    expect(root.querySelector<HTMLElement>('[data-reveal]')?.hidden).toBe(false);
    vi.advanceTimersByTime(1);
    expect(steps(root)).toEqual(s.lines.slice(0, 1));
    vi.advanceTimersByTime(2000);
    expect(steps(root)).toEqual(s.lines);
    expect(root.querySelector('[data-reveal-summary]')?.textContent).toBe(s.summary);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(399);
    expect(done).toHaveBeenCalledOnce();
    expect(root.hasAttribute('data-revealing')).toBe(false);
    expect(root.querySelector<HTMLElement>('[data-reveal]')?.hidden).toBe(true);
  });

  it('takes under a second for a later review in the same visit', () => {
    const root = result();
    const done = vi.fn();
    stageReveal(root, revealSteps(review(), tr), true, done);
    vi.advanceTimersByTime(800);
    expect(done).toHaveBeenCalledOnce();
  });

  it('ends at once when cancelled, without calling it done', () => {
    const root = result();
    const done = vi.fn();
    const end = stageReveal(root, revealSteps(review(), tr), false, done);
    vi.advanceTimersByTime(500);
    end();
    expect(root.hasAttribute('data-revealing')).toBe(false);
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
  });
});
