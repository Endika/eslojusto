// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { answers } from '../../src/bills/answers';

function formOf(values: Record<string, string>): HTMLFormElement {
  const form = document.createElement('form');
  for (const [name, value] of Object.entries(values)) {
    const input = document.createElement('input');
    input.name = name;
    input.value = value;
    form.append(input);
  }
  return form;
}

describe('the answers of a bills form', () => {
  it('trims what is typed', () => {
    expect(answers(formOf({ a: '  hola  ' })).text('a')).toBe('hola');
  });

  it('keeps a date left empty as missing only when it is required', () => {
    const a = answers(formOf({ d: '' }));
    expect(a.date('d', false)).toBeNull();
    expect(a.errors).toEqual([]);
    expect(a.date('d', true)).toBeNull();
    expect(a.errors).toEqual([{ field: 'd', code: 'missing_value' }]);
  });

  it('keeps a date that does not exist as invalid', () => {
    const a = answers(formOf({ d: '2026-02-31' }));
    expect(a.date('d', false)).toBeNull();
    expect(a.errors).toEqual([{ field: 'd', code: 'invalid_date' }]);
  });

  it('keeps a figure left empty as missing only when it is required', () => {
    const a = answers(formOf({ n: ' ' }));
    expect(a.figure('n', false)).toBeNull();
    expect(a.errors).toEqual([]);
    expect(a.figure('n', true)).toBeNull();
    expect(a.errors).toEqual([{ field: 'n', code: 'missing_value' }]);
  });
});
