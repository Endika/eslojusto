// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { applies, gate } from '../../src/insurance/conditions';
import { sheetErrors } from '../../src/insurance/form';

const TODAY = parseDate('2026-10-09');

type Values = Readonly<Record<string, string | null>>;

// A home policy bought online, with its renewal notice; tests change what they check. A null
// value leaves the question out, as a hidden question is.
const ANSWERS: Values = {
  line: 'home',
  carCover: null,
  mortgageRequired: 'no',
  renews: 'yes',
  expiresOn: '2027-03-01',
  distance: 'yes',
  concludedOn: '2026-10-01',
  policyReceived: 'yes',
  policyReceivedOn: '2026-10-03',
  hasNotice: 'yes',
  noticeReceivedOn: '2026-10-05',
  previousPremium: '300,00',
  newPremium: '345,00',
  changes: 'no',
};

function form(change: Values = {}): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = Object.entries({ ...ANSWERS, ...change })
    .filter(([, value]) => value !== null)
    .map(([name, value]) => `<input name="${name}" value="${value}" />`)
    .join('');
  return el;
}

describe('the insurance form', () => {
  it("puts the engine's checks on the question that asks them", () => {
    const el = form({ noticeReceivedOn: '2026-12-01', policyReceivedOn: '2026-09-01' });
    expect(sheetErrors(el, 'condiciones', TODAY)).toEqual([
      { field: 'policyReceivedOn', code: 'before_concluded' },
    ]);
    expect(sheetErrors(el, 'renovacion', TODAY)).toEqual([
      { field: 'noticeReceivedOn', code: 'in_future' },
    ]);
    expect(sheetErrors(form({ expiresOn: '2029-01-01' }), 'vencimiento', TODAY)).toEqual([
      { field: 'expiresOn', code: 'too_far_ahead' },
    ]);
  });
});

describe('the gate', () => {
  it.each(['health'])('stops a %s policy whatever its dates', (line) => {
    const el = form({ line, expiresOn: null });
    expect(gate(el)).toMatchObject({ inScope: false });
    expect(applies(el, 'contratacion')).toBe(false);
    expect(applies(el, 'resultado')).toBe(true);
  });

  it('stops a period that ended before the current art. 22 LCS', () => {
    expect(gate(form({ expiresOn: '2015-12-31' }))).toEqual({
      inScope: false,
      reason: 'before_2016',
    });
  });

  it.each([
    ['yes', 'no', [true, false, false]],
    ['unknown', 'no', [true, false, false]],
    ['no', 'yes', [false, true, true]],
  ])(
    'asks the terms and the figures with distance «%s» and notice «%s»',
    (distance, hasNotice, expected) => {
      const el = form({ distance: null, hasNotice: null });
      el.insertAdjacentHTML(
        'beforeend',
        `<input type="radio" name="distance" value="${distance}" checked />
         <input type="radio" name="hasNotice" value="${hasNotice}" checked />`,
      );
      expect((['condiciones', 'primas', 'cambios'] as const).map((s) => applies(el, s))).toEqual(
        expected,
      );
    },
  );

  it('always asks the policy sheet and the result, and the rest of a policy within the review', () => {
    const outside = form({ line: 'life', expiresOn: null });
    expect(applies(outside, 'poliza')).toBe(true);
    expect(applies(form(), 'contratacion')).toBe(true);
  });

  it('lets a home policy through, and waits while the policy sheet does not read', () => {
    expect(gate(form())).toEqual({ inScope: true });
    expect(gate(form({ line: '' }))).toEqual({ inScope: true });
  });
});
