// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { applyConditions, applies, gate } from '../../src/insurance/conditions';
import { readInsuranceForm, sheetErrors, sheetOfField } from '../../src/insurance/form';

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

const read = (change: Values = {}) => readInsuranceForm(form(change), TODAY);

describe('the insurance form', () => {
  it('reads a complete home policy and its notice', () => {
    expect(read()).toEqual({
      input: {
        line: 'home',
        carCover: null,
        mortgageRequired: false,
        renews: true,
        expiresOn: parseDate('2027-03-01'),
        notice: {
          receivedOn: parseDate('2026-10-05'),
          previousPremium: 300,
          newPremium: 345,
          changes: false,
        },
        distance: true,
        concludedOn: parseDate('2026-10-01'),
        policyReceived: true,
        policyReceivedOn: parseDate('2026-10-03'),
      },
    });
  });

  it('feeds «No lo sé» on the mortgage as an open answer', () => {
    expect(read({ mortgageRequired: 'unknown' })).toMatchObject({
      input: { mortgageRequired: null },
    });
  });

  it('asks a motor policy for its cover and never about a mortgage', () => {
    expect(read({ line: 'car', carCover: 'with_voluntary', mortgageRequired: null })).toMatchObject(
      { input: { line: 'car', carCover: 'with_voluntary', mortgageRequired: null } },
    );
    expect(read({ line: 'car', carCover: '', mortgageRequired: null })).toEqual({
      errors: [{ field: 'carCover', code: 'missing_choice' }],
    });
  });

  it('without a notice, leaves its figures out', () => {
    const r = read({
      hasNotice: 'no',
      noticeReceivedOn: null,
      previousPremium: null,
      newPremium: null,
      changes: null,
    });
    expect(r).toMatchObject({ input: { notice: null } });
  });

  it('takes premiums as optional figures', () => {
    expect(read({ previousPremium: '', newPremium: '' })).toMatchObject({
      input: { notice: { previousPremium: null, newPremium: null } },
    });
    expect(read({ newPremium: 'mucho' })).toEqual({
      errors: [{ field: 'newPremium', code: 'invalid_amount' }],
    });
  });

  it('needs the day it was bought only when it was bought at a distance', () => {
    expect(read({ concludedOn: '' })).toEqual({
      errors: [{ field: 'concludedOn', code: 'missing_value' }],
    });
    expect(read({ distance: 'no', concludedOn: '' })).toMatchObject({
      input: { distance: false, concludedOn: null },
    });
  });

  it('without a distance sale, asks neither the dates nor the receipt', () => {
    expect(
      read({ distance: 'no', concludedOn: null, policyReceived: null, policyReceivedOn: null }),
    ).toMatchObject({
      input: { distance: false, concludedOn: null, policyReceived: null, policyReceivedOn: null },
    });
  });

  it('drops the day of receipt unless the terms arrived', () => {
    expect(read({ policyReceived: 'no' })).toMatchObject({
      input: { policyReceived: false, policyReceivedOn: null },
    });
  });

  it('lists every missing answer of a sheet', () => {
    const el = form({ line: 'home', mortgageRequired: '', renews: '', expiresOn: '' });
    expect(sheetErrors(el, 'cobertura', TODAY)).toEqual([
      { field: 'mortgageRequired', code: 'missing_choice' },
    ]);
    expect(sheetErrors(el, 'vencimiento', TODAY)).toEqual([
      { field: 'renews', code: 'missing_choice' },
      { field: 'expiresOn', code: 'missing_value' },
    ]);
  });

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

  it('knows which sheet asks each question', () => {
    expect(sheetOfField('line')).toBe('poliza');
    expect(sheetOfField('mortgageRequired')).toBe('cobertura');
    expect(sheetOfField('expiresOn')).toBe('vencimiento');
    expect(sheetOfField('concludedOn')).toBe('contratacion');
    expect(sheetOfField('policyReceivedOn')).toBe('condiciones');
    expect(sheetOfField('noticeReceivedOn')).toBe('renovacion');
    expect(sheetOfField('previousPremium')).toBe('primas');
    expect(sheetOfField('changes')).toBe('cambios');
  });
});

describe('the gate', () => {
  it.each(['life', 'health', 'funeral', 'other'])(
    'stops a %s policy whatever its dates',
    (line) => {
      const el = form({ line, expiresOn: null });
      expect(gate(el)).toMatchObject({ inScope: false });
      expect(applies(el, 'contratacion')).toBe(false);
      expect(applies(el, 'resultado')).toBe(true);
    },
  );

  it('stops a period that ended before the current art. 22 LCS', () => {
    expect(gate(form({ expiresOn: '2015-12-31' }))).toEqual({
      inScope: false,
      reason: 'before_2016',
    });
  });

  it('asks the terms only after a distance sale, and the figures only with a notice', () => {
    const el = document.createElement('form');
    el.innerHTML = `
      <input type="radio" name="line" value="home" checked />
      <input name="expiresOn" value="2027-03-01" />
      <input type="radio" name="distance" value="yes" />
      <input type="radio" name="distance" value="no" checked />
      <input type="radio" name="hasNotice" value="yes" />
      <input type="radio" name="hasNotice" value="no" checked />`;
    const asked = () => (['condiciones', 'primas', 'cambios'] as const).map((s) => applies(el, s));
    expect(asked()).toEqual([false, false, false]);
    for (const input of el.querySelectorAll<HTMLInputElement>('[value="yes"]'))
      input.checked = true;
    expect(asked()).toEqual([true, true, true]);
  });

  it('lets a home policy through, and waits while the policy sheet does not read', () => {
    expect(gate(form())).toEqual({ inScope: true });
    expect(gate(form({ line: '' }))).toEqual({ inScope: true });
  });
});

describe('the conditions', () => {
  it('asks the contract dates only when it may have been bought at a distance', () => {
    const el = document.createElement('form');
    el.innerHTML = `
      <input type="radio" name="distance" value="yes" />
      <input type="radio" name="distance" value="no" checked />
      <input type="radio" name="distance" value="unknown" />
      <div data-if="distance:yes unknown">
        <input name="concludedOn" />
        <div data-if="policyReceived:yes"><input name="policyReceivedOn" /></div>
      </div>`;
    const disabled = (name: string) =>
      el.querySelector<HTMLInputElement>(`[name="${name}"]`)?.disabled;
    applyConditions(el);
    expect(disabled('concludedOn')).toBe(true);
    for (const value of ['yes', 'unknown']) {
      const radio = el.querySelector<HTMLInputElement>(`[name="distance"][value="${value}"]`);
      if (!radio) throw new Error(`no ${value} radio`);
      radio.checked = true;
      applyConditions(el);
      expect(disabled('concludedOn')).toBe(false);
    }
  });

  it('asks about the mortgage only for a home and the cover only for a car', () => {
    const el = document.createElement('form');
    el.innerHTML = `
      <input type="radio" name="line" value="home" />
      <input type="radio" name="line" value="car" checked />
      <fieldset data-if="line:home"><input type="radio" name="mortgageRequired" value="no" /></fieldset>
      <fieldset data-if="line:car"><input type="radio" name="carCover" value="compulsory_only" /></fieldset>
      <div data-if="line:home car"><input name="expiresOn" /></div>`;
    applyConditions(el);
    const disabled = (name: string) =>
      el.querySelector<HTMLInputElement>(`[name="${name}"]`)?.disabled;
    expect([disabled('mortgageRequired'), disabled('carCover'), disabled('expiresOn')]).toEqual([
      true,
      false,
      false,
    ]);
  });
});
