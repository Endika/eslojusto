// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Detail } from '../../src/calculator/flow';
import { SHEET_FIELDS, SHEETS } from '../../src/credit/form';
import { setUpCredit } from '../../src/credit/main';
import type { CreditEvents } from '../../src/credit/ports';
import { pageTranslator } from '../support/page-strings';
import { DEPS, result } from './fixtures';

const tr = pageTranslator('credit');
const today = () => ({ y: 2026, m: 10, d: 9 });

const LOAN: readonly (readonly [string, string])[] = [
  ['product', 'personal_loan'],
  ['purpose', 'personal'],
  ['principal', '10.500,00'],
  ['agreedOn', '2019-02-15'],
  ['drawnOn', '2019-02-15'],
  ['nominalRate', '12'],
  ['rateType', 'fixed'],
  ['aprStated', 'yes'],
  ['declaredApr', '12,00'],
  ['declaredTotalPayable', '13.120,80'],
  ['instalmentCount', '48'],
  ['instalmentAmount', '273,35'],
  ['firstDueOn', '2019-03-15'],
  ['hasBalloon', 'no'],
  ['openingFee', '761,25'],
  ['openingHow', 'deducted'],
  ['hasInsurance', 'no'],
  ['confirmedApr', 'recalculated'],
  ['repaid', 'no'],
  ['infoReceived', 'yes'],
];
const CHOICES: Readonly<Record<string, readonly string[]>> = {
  product: ['personal_loan', 'mortgage'],
  purpose: ['personal'],
  rateType: ['fixed'],
  aprStated: ['yes'],
  hasBalloon: ['no'],
  openingHow: ['deducted'],
  hasInsurance: ['no'],
  confirmedApr: ['recalculated'],
  repaid: ['no'],
  infoReceived: ['yes'],
};

const controls = (field: string) =>
  (CHOICES[field] ?? [null])
    .map((v) =>
      v === null ? `<input name="${field}">` : `<input type="radio" name="${field}" value="${v}">`,
    )
    .join('');

function mount(): void {
  const sheets = SHEETS.map(
    (s) =>
      `<section data-sheet="${s}"><h2 tabindex="-1">${s}</h2>${SHEET_FIELDS[s]
        .filter((f) => LOAN.some(([name]) => name === f))
        .map((f) => `${controls(f)}<p data-error-for="${f}" hidden></p>`)
        .join('')}</section>`,
  ).join('');
  document.body.innerHTML = `
    <main><h2 id="result-title" tabindex="-1"></h2>
      <form id="credit">${sheets}<div class="actions">
        <button type="button" data-back></button><button type="button" data-next></button>
        <button type="submit" data-submit></button></div></form>
      <div id="resultado"></div></main>`;
  const slot = document.querySelector('#resultado') as HTMLElement;
  const shown = result();
  shown.insertAdjacentHTML('beforeend', '<button type="button" data-restart></button>');
  slot.replaceWith(Object.assign(shown, { id: 'resultado' }));
}

function setUp(detail?: () => Detail) {
  const events = {
    stepShown: vi.fn(),
    wentBack: vi.fn(),
    stepCompleted: vi.fn(),
    fieldRejected: vi.fn(),
    helpOpened: vi.fn(),
    startedOver: vi.fn(),
    outOfScope: vi.fn(),
    reviewCompleted: vi.fn(),
    reviewCleared: vi.fn(),
  } satisfies CreditEvents;
  const section = setUpCredit(document.body, {
    events,
    today,
    tr,
    tables: DEPS,
    ...(detail === undefined ? {} : { detail }),
  });
  return { events, section };
}

const count = () => document.querySelector<HTMLElement>('[data-count]');
const items = () => document.querySelectorAll('[data-items] [data-item]').length;

beforeEach(() => {
  history.replaceState(null, '', location.pathname);
  mount();
});

describe('the credit review on its page', () => {
  it('shows a credit inside the review and tells who listens, with its answers', () => {
    const { events, section } = setUp();
    section.fill(LOAN);
    expect(section.review()).toBe(true);
    expect(items()).toBeGreaterThan(0);
    expect(events.reviewCompleted).toHaveBeenCalledTimes(1);
    expect(events.reviewCompleted.mock.calls[0]?.[0]).toMatchObject({
      review: { scope: { inScope: true } },
      input: { product: 'personal_loan', principal: 10_500 },
    });
    expect(events.outOfScope).not.toHaveBeenCalled();
    expect(count()?.hidden).toBe(true);
  });

  it('stops a credit outside the review at the gate and clears what was shown', () => {
    const { events, section } = setUp();
    section.fill(LOAN);
    section.review();
    section.fill([['product', 'mortgage']]);
    expect(section.review()).toBe(true);
    expect(events.outOfScope).toHaveBeenCalledWith('mortgage');
    expect(events.reviewCleared).toHaveBeenCalledTimes(1);
    expect(events.reviewCompleted).toHaveBeenCalledTimes(1);
    expect(items()).toBe(0);
    expect(document.querySelector<HTMLElement>('[data-out-of-scope]')?.hidden).toBe(false);
    section.refreshResult();
    expect(items()).toBe(0);
  });

  it('returns what the form still lacks instead of reviewing', () => {
    const { events, section } = setUp();
    section.fill(LOAN.filter(([name]) => name !== 'nominalRate'));
    expect(section.review()).toBe(false);
    expect(events.reviewCompleted).not.toHaveBeenCalled();
    expect(events.fieldRejected).toHaveBeenCalledWith('interes', 'nominalRate', 'missing_value');
    expect(document.querySelector('[data-error-for="nominalRate"]')?.textContent).not.toBe('');
  });

  it('words a locked review and shows it unlocked unless told otherwise', () => {
    {
      const { section } = setUp(() => 'locked');
      section.fill(LOAN);
      section.review();
      expect(count()?.hidden).toBe(false);
    }

    {
      const { section } = setUp();
      section.fill(LOAN);
      section.review();
      section.refreshResult();
      expect(count()?.hidden).toBe(true);
    }
  });

  it('shows the review again as the pass leaves its detail, and forgets it on starting over', () => {
    let detail: Detail = 'unlocked';
    const { events, section } = setUp(() => detail);
    section.fill(LOAN);
    section.review();
    const unlocked = items();
    expect(count()?.hidden).toBe(true);
    detail = 'locked';
    section.refreshResult();
    expect(count()?.hidden).toBe(false);
    expect(items()).toBeLessThan(unlocked);
    document.querySelector<HTMLButtonElement>('[data-restart]')?.click();
    expect(events.reviewCleared).toHaveBeenCalledTimes(1);
    const before = document.querySelector('[data-items]')?.innerHTML;
    detail = 'unlocked';
    section.refreshResult();
    expect(document.querySelector('[data-items]')?.innerHTML).toBe(before);
  });
});
