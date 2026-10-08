// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { NORMS } from '../../src/engine/rental/data/norms';
import { applyConditions, gate } from '../../src/rental/conditions';
import { fieldOfError, readRentalForm, sheetErrors } from '../../src/rental/form';
import { ROW_LISTS, setUpRows } from '../../src/rental/rows';
import { contract, TODAY, tr, update } from './fixtures';

const radios = (name: string, values: readonly string[], row = false) =>
  values
    .map((v) => `<input type="radio" ${row ? 'data-row-field' : 'name'}="${name}" value="${v}" />`)
    .join('');

const FEE_ROW = `
  <li data-row><fieldset><legend data-row-legend></legend>
    <select data-row-field="kind"><option value="agency_fee"></option><option value="management"></option></select>
    <input data-row-field="amount" /><p data-row-error="amount" hidden></p>
    ${radios('deductedLater', ['yes', 'no'], true)}
    <div data-row-if="kind:management" data-if-signed-from="2026-10-08">
      ${radios('requestedInWriting', ['yes', 'no', 'unknown'], true)}
    </div>
    <button type="button" data-row-remove></button>
  </fieldset></li>`;

const list = (name: string, row: string, condition = '') => `
  <div data-rows="${name}" data-min="1" data-max="3" ${condition}>
    <ol data-rows-list></ol><button type="button" data-rows-add></button>
    <template data-rows-template>${row}</template>
  </div>`;

// The sheets' controls as RentalForm.astro names them; only the fee rows are filled in here.
function form(): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = `
    ${radios('contractType', ['main_home', 'seasonal', 'room'])}
    <input type="date" name="signedOn" /><input type="date" name="startDate" />
    ${radios('landlordType', ['person', 'company'])}
    ${radios('largeLandlord', ['yes', 'no', 'unknown'])}
    <select name="region"><option value=""></option><option value="MD">MD</option></select>
    ${radios('stressedZone', ['yes', 'no', 'unknown'])}
    <input name="deposit" />
    ${radios('hasFees', ['no', 'yes'])}
    ${list('fees', FEE_ROW, 'data-if="hasFees:yes"')}
    ${ROW_LISTS.filter((l) => l !== 'fees')
      .map((l) => list(l, '<li data-row></li>', 'data-if="never:yes"'))
      .join('')}
    <input name="initialRent" /><input name="agreedMonths" />
    ${radios('updateClause', ['none', 'ipc', 'fixed_percent'])}
    <div data-if="updateClause:fixed_percent"><input name="fixedPercent" /></div>`;
  document.body.replaceChildren(el);
  setUpRows(el, tr, () => applyConditions(el));
  applyConditions(el);
  return el;
}

function set(f: HTMLFormElement, name: string, value: string) {
  const controls = [...f.querySelectorAll<HTMLInputElement>(`[name="${name}"]`)];
  const radio = controls.find((c) => c.type === 'radio' && c.value === value);
  if (radio) radio.checked = true;
  else if (controls[0]) controls[0].value = value;
  applyConditions(f);
}

const ANSWERS: readonly (readonly [string, string])[] = [
  ['contractType', 'main_home'],
  ['signedOn', '2024-03-15'],
  ['startDate', '2024-03-20'],
  ['landlordType', 'person'],
  ['largeLandlord', 'no'],
  ['region', 'MD'],
  ['stressedZone', 'unknown'],
  ['hasFees', 'no'],
  ['initialRent', '1.000,00'],
  ['agreedMonths', '60'],
  ['updateClause', 'ipc'],
];

function answered(change: readonly (readonly [string, string])[] = []): HTMLFormElement {
  const f = form();
  for (const [name, value] of [...ANSWERS, ...change]) set(f, name, value);
  return f;
}

describe('reading the form', () => {
  it('turns the answers into the engine input; what is not asked keeps out', () => {
    const r = readRentalForm(answered(), TODAY);
    expect(r).toEqual({
      input: expect.objectContaining({
        contractType: 'main_home',
        signedOn: { y: 2024, m: 3, d: 15 },
        largeLandlord: false,
        stressedZone: null,
        region: 'MD',
        initialRent: 1000,
        agreedMonths: 60,
        updateClause: 'ipc',
        deposit: null,
        fees: [],
      }),
    });
    if ('input' in r) expect(r.input).not.toHaveProperty('fixedPercent');
  });

  it('asks the percentage only for a fixed-percent clause', () => {
    const f = answered([['updateClause', 'fixed_percent']]);
    expect(sheetErrors(f, 'renta', TODAY)).toEqual([
      { field: 'fixedPercent', code: 'missing_value' },
    ]);
  });

  it('puts each error on its own field, the engine’s too', () => {
    const f = answered([
      ['signedOn', '2027-01-01'],
      ['startDate', '2027-01-01'],
      ['initialRent', '0'],
    ]);
    expect(sheetErrors(f, 'contrato', TODAY)).toEqual([
      { field: 'signedOn', code: 'signed_in_future' },
    ]);
    expect(sheetErrors(f, 'renta', TODAY)).toEqual([
      { field: 'initialRent', code: 'amount_out_of_range' },
    ]);
  });

  it('reads fee rows and asks about a written request only where it decides the fee', () => {
    const f = answered([['hasFees', 'yes']]);
    const row = (key: string) => f.querySelector<HTMLInputElement>(`[name="fees.0.${key}"]`);
    const kind = f.querySelector<HTMLSelectElement>('[name="fees.0.kind"]');
    if (!kind) throw new Error('no row');
    kind.value = 'management';
    set(f, 'fees.0.amount', '150');
    set(f, 'fees.0.deductedLater', 'no');
    expect(row('requestedInWriting')?.disabled).toBe(true);
    expect(sheetErrors(f, 'entrada', TODAY)).toEqual([]);
    set(f, 'signedOn', '2026-10-08');
    set(f, 'startDate', '2026-10-08');
    expect(row('requestedInWriting')?.disabled).toBe(false);
    expect(sheetErrors(f, 'entrada', TODAY)).toEqual([
      { field: 'fees.0.requestedInWriting', code: 'missing_choice' },
    ]);
    set(f, 'fees.0.requestedInWriting', 'unknown');
    const r = readRentalForm(f, TODAY);
    expect('input' in r && r.input.fees).toEqual([
      { kind: 'management', amount: 150, deductedLater: false, requestedInWriting: null },
    ]);
  });
});

describe('the gate', () => {
  it.each([
    ['main_home', '2024-03-15', { inScope: true }],
    ['main_home', '2018-05-02', { inScope: false, reason: 'before_2019' }],
    ['seasonal', '2024-03-15', { inScope: false, reason: 'seasonal' }],
  ])('%s signed on %s', (type, signed, expected) => {
    const f = answered([
      ['contractType', type],
      ['signedOn', signed],
      ['startDate', signed],
    ]);
    expect(gate(f, NORMS)).toEqual(expected);
  });

  it('lets the visit go on until the contract sheet reads', () => {
    expect(gate(form(), NORMS)).toEqual({ inScope: true });
  });
});

describe('engine errors on rows', () => {
  const rows = {
    guarantees: [],
    fees: [],
    updates: [[2]],
    charges: [[0, 3]],
    returns: [[1]],
    deductions: [],
  };
  const input = contract({
    updates: [update('2025-03-20', 1000, 1030)],
    charges: [
      {
        kind: 'community',
        inContract: true,
        annualAgreed: 600,
        charged: [
          { year: 2024, amount: 600 },
          { year: 2030, amount: 600 },
        ],
      },
    ],
  });

  it.each([
    [{ field: 'updates', index: 0, code: 'not_an_anniversary' }, 'updates.2.year'],
    [{ field: 'updates', index: 0, code: 'notice_date_missing' }, 'updates.2.noticeOn'],
    [{ field: 'updates', index: 0, code: 'charged_before_start' }, 'updates.2.chargedFrom'],
    [{ field: 'charges', index: 0, code: 'year_out_of_range' }, 'charges.3.year'],
    [{ field: 'moveOut', index: 0, code: 'return_before_keys' }, 'returns.1.on'],
    [{ field: 'moveOut', code: 'keys_in_future' }, 'keysReturnedOn'],
    [{ field: 'signedOn', code: 'signed_in_future' }, 'signedOn'],
  ] as const)('%o lands on %s', (error, field) => {
    expect(fieldOfError(error, rows, input, TODAY)).toBe(field);
  });
});
