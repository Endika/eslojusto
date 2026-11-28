// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  formScope,
  readTelecomForm,
  sheetErrors,
  sheetOfField,
} from '../../../src/bills/telecom/form';
import { parseDate } from '../../../src/engine/date';

const TODAY = parseDate('2026-10-13');

type Values = Readonly<Record<string, string>>;

const EXIT: Values = {
  hasCommitment: 'yes',
  startedOn: '2025-03-01',
  months: '18',
  agreedPenalty: '180',
  exitRequestedOn: '2026-03-01',
  change: 'none',
  penaltyCharged: '120',
  chargedAfter: 'no',
};

function form(change: Values = {}, without: readonly string[] = []): HTMLFormElement {
  const el = document.createElement('form');
  for (const [name, value] of Object.entries({ ...EXIT, ...change })) {
    if (without.includes(name)) continue;
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    el.append(input);
  }
  return el;
}

const errorsOf = (el: HTMLFormElement) => {
  const r = readTelecomForm(el, TODAY);
  return 'errors' in r ? r.errors : [];
};
const inputOf = (el: HTMLFormElement) => {
  const r = readTelecomForm(el, TODAY);
  if (!('input' in r)) throw new Error(JSON.stringify(r.errors));
  return r.input;
};

const NOTICE: Values = {
  change: 'notice',
  sentOn: '2026-02-01',
  appliesOn: '2026-03-10',
  changeKind: 'price_up',
  priceIndex: 'ipc',
  hasHandset: 'no',
};

describe('the questions a telecom answer opens', () => {
  it('asks the start and the months only of a commitment, and the agreed penalty never as required', () => {
    expect(
      errorsOf(form({ hasCommitment: 'no', startedOn: '', months: '', agreedPenalty: 'x' })),
    ).toEqual([]);
    expect(errorsOf(form({ startedOn: '', months: '' }))).toEqual([
      { field: 'startedOn', code: 'missing_value' },
      { field: 'months', code: 'missing_value' },
    ]);
    expect(inputOf(form({ agreedPenalty: '' })).commitment?.agreedPenalty).toBeNull();
  });

  it('asks the notice only of a notified change, with the day it applies as optional', () => {
    expect(errorsOf(form({ ...NOTICE, sentOn: '' }))).toEqual([
      { field: 'sentOn', code: 'missing_value' },
    ]);
    expect(inputOf(form(NOTICE)).changeNotice).toEqual({
      sentOn: parseDate('2026-02-01'),
      appliesOn: parseDate('2026-03-10'),
      change: 'price_up',
      index: 'ipc',
    });
    expect(inputOf(form({ ...NOTICE, appliesOn: '' })).changeNotice).toMatchObject({
      appliesOn: null,
    });
    expect(
      inputOf(form({ ...NOTICE, change: 'none', sentOn: 'x', appliesOn: 'x' })).changeNotice,
    ).toBeNull();
    expect(
      inputOf(form({ ...NOTICE, change: 'no_notice', sentOn: '', appliesOn: '' })).changeNotice,
    ).toEqual({ sentOn: null, appliesOn: null, change: 'price_up', index: 'ipc' });
  });

  it('asks the kind and the handset of any change, and the price index only of a price rise', () => {
    const noticed = (change: Values) => form({ ...NOTICE, hasHandset: 'no', ...change });
    expect(errorsOf(noticed({ changeKind: '' }))).toEqual([
      { field: 'changeKind', code: 'missing_choice' },
    ]);
    expect(errorsOf(noticed({ hasHandset: '' }))).toEqual([
      { field: 'hasHandset', code: 'missing_choice' },
    ]);
    expect(errorsOf(noticed({ priceIndex: '' }))).toEqual([
      { field: 'priceIndex', code: 'missing_choice' },
    ]);
    expect(
      inputOf(noticed({ changeKind: 'service_worse', priceIndex: '' })).changeNotice,
    ).toMatchObject({
      change: 'service_worse',
      index: 'none',
    });
    expect(inputOf(noticed({})).changeNotice).toMatchObject({ change: 'price_up', index: 'ipc' });
    expect(errorsOf(form({ change: 'none', changeKind: '', hasHandset: '' }))).toEqual([]);
  });

  it('asks the handset value and whether it was kept only of a subsidised one', () => {
    const noticed = (change: Values) =>
      form({ ...NOTICE, hasHandset: 'yes', handsetValue: '300', handsetKept: 'yes', ...change });
    expect(inputOf(noticed({})).handset).toEqual({ value: 300, kept: true });
    expect(inputOf(noticed({ handsetKept: 'no' })).handset).toEqual({ value: 300, kept: false });
    expect(errorsOf(noticed({ handsetValue: '' }))).toEqual([
      { field: 'handsetValue', code: 'missing_value' },
    ]);
    expect(errorsOf(noticed({ handsetKept: '' }))).toEqual([
      { field: 'handsetKept', code: 'missing_choice' },
    ]);
    expect(
      inputOf(noticed({ hasHandset: 'no', handsetValue: 'x', handsetKept: '' })).handset,
    ).toBeNull();
  });

  it('asks the penalty charged always', () => {
    expect(errorsOf(form({ penaltyCharged: '' }))).toEqual([
      { field: 'penaltyCharged', code: 'missing_value' },
    ]);
  });

  it('asks the lines of after the exit only when something was charged', () => {
    const after = (change: Values = {}) =>
      form({
        chargedAfter: 'yes',
        lineFrom: '2026-03-02',
        lineTo: '2026-03-31',
        lineAmount: '30',
        ...change,
      });
    expect(inputOf(after()).lines).toEqual([
      { from: parseDate('2026-03-02'), to: parseDate('2026-03-31'), amount: 30 },
    ]);
    expect(errorsOf(after({ lineFrom: '', lineTo: '', lineAmount: '' }))).toEqual([
      { field: 'lineFrom', code: 'missing_value' },
      { field: 'lineTo', code: 'missing_value' },
      { field: 'lineAmount', code: 'missing_value' },
    ]);
    expect(inputOf(form({ lineFrom: 'x', lineTo: 'x', lineAmount: 'x' })).lines).toEqual([]);
  });
});

describe('the answers of a telecom form', () => {
  it('gives the engine’s errors once every answer reads', () => {
    expect(errorsOf(form({ months: '0' }))).toEqual([{ field: 'months', code: 'count_range' }]);
  });

  it('gives only the errors of the sheet asked', () => {
    const el = form({ months: '0', exitRequestedOn: '' });
    expect(sheetErrors(el, 'permanencia', TODAY)).toEqual([]);
    expect(sheetErrors(el, 'baja', TODAY)).toEqual([
      { field: 'exitRequestedOn', code: 'missing_value' },
    ]);
    const engine = form({ months: '0' });
    expect(sheetErrors(engine, 'permanencia', TODAY)).toEqual([
      { field: 'months', code: 'count_range' },
    ]);
    expect(sheetErrors(engine, 'cobros', TODAY)).toEqual([]);
    expect(sheetErrors(form(), 'permanencia', TODAY)).toEqual([]);
  });

  it('finds the sheet of a question, the first one when it is none', () => {
    expect(sheetOfField('lineAmount')).toBe('despues');
    expect(sheetOfField('priceIndex')).toBe('cambio');
    expect(sheetOfField('nope' as never)).toBe('permanencia');
  });

  it('keeps the visit going until the exit date reads, then says whether it is in the review', () => {
    expect(formScope(form({ exitRequestedOn: '' }))).toEqual({ inScope: true });
    expect(formScope(form({ exitRequestedOn: '2021-12-31' }))).toEqual({
      inScope: false,
      reason: 'exit_before_2022',
    });
    expect(formScope(form())).toEqual({ inScope: true });
  });
});
