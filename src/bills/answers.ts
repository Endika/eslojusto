import { parseAmount } from '../calculator/number';
import { pick, tryDate } from '../calculator/review-form';
import type { CivilDate } from '../engine/date';
import type { FieldErrorCode } from './result';

export interface FieldError<Field extends string> {
  readonly field: Field;
  readonly code: FieldErrorCode;
}

// The answers of a bills form as the engine takes them, each failing answer kept with its question.
// FormData leaves out disabled controls, so a question that does not apply never reaches the engine.
export function answers<Field extends string>(form: HTMLFormElement) {
  const data = new FormData(form);
  const errors: FieldError<Field>[] = [];
  const fail = (field: Field, code: FieldErrorCode) => errors.push({ field, code });
  const text = (field: Field): string => {
    const v = data.get(field);
    return typeof v === 'string' ? v.trim() : '';
  };

  // A radio answer among `options`, or null while unanswered.
  const choice = <T extends string>(field: Field, options: readonly T[], required = true) => {
    const v = pick(text(field), options);
    if (v === null && required) fail(field, 'missing_choice');
    return v;
  };

  // A figure with a decimal comma; null when left empty and optional.
  const figure = (field: Field, required: boolean): number | null => {
    const n = parseAmount(text(field));
    if (n === null) {
      if (required) fail(field, 'missing_value');
      return null;
    }
    if (Number.isNaN(n)) {
      fail(field, 'invalid_number');
      return null;
    }
    return n;
  };

  const date = (field: Field, required: boolean): CivilDate | null => {
    const t = text(field);
    if (t === '') {
      if (required) fail(field, 'missing_value');
      return null;
    }
    const d = tryDate(t);
    if (d === null) fail(field, 'invalid_date');
    return d;
  };

  return { errors, fail, text, choice, figure, date };
}
