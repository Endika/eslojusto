import { describe, expect, it } from 'vitest';
import {
  amountOf,
  dateOf,
  isNumber,
  isoOf,
  lowest,
  numberOf,
  oneOf,
  positiveAmountOf,
  positiveOf,
  textOf,
  textOrBlank,
  wholeOf,
  yesNo,
} from '../../src/documents/read';

const NOT_NUMBERS = ['5', true, false, '', undefined] as const;
const NOT_FINITE = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

describe('the least sure confidence', () => {
  it.each([
    [[], 'high'],
    [['high'], 'high'],
    [['high', 'medium'], 'medium'],
    [['medium', 'high'], 'medium'],
    [['medium', 'low'], 'low'],
    [['low', 'medium'], 'low'],
    [['low', 'high', 'medium'], 'low'],
    [['medium', 'medium'], 'medium'],
  ] as const)('of %j is %s', (given, expected) => {
    expect(lowest(...given)).toBe(expected);
  });
});

describe('a number', () => {
  it.each([0, -2, 3.5])('is %s', (n) => {
    expect(isNumber(n)).toBe(true);
  });

  it.each([...NOT_FINITE, ...NOT_NUMBERS])('is not %s', (v) => {
    expect(isNumber(v)).toBe(false);
  });
});

describe('a figure', () => {
  it.each([0, 3, 2.345])('is kept as it is when it is %s', (n) => {
    expect(numberOf(n)).toBe(n);
  });

  it.each([-1, ...NOT_FINITE, ...NOT_NUMBERS])('is none when it is %s', (v) => {
    expect(numberOf(v)).toBeNull();
  });
});

describe('an amount of money', () => {
  it.each([
    [0, 0],
    [12, 12],
    [1.236, 1.24],
    [10_500.454, 10_500.45],
    [0.004, 0],
  ])('reads %s as %s', (given, expected) => {
    expect(amountOf(given)).toBe(expected);
  });

  it.each([-0.01, ...NOT_FINITE, ...NOT_NUMBERS])('is none when it is %s', (v) => {
    expect(amountOf(v)).toBeNull();
  });
});

describe('an amount above zero', () => {
  it.each([
    [0.004, 0],
    [0.01, 0.01],
    [1.236, 1.24],
    [12, 12],
  ])('reads %s as %s', (given, expected) => {
    expect(positiveAmountOf(given)).toBe(expected);
  });

  it.each([0, -1, ...NOT_FINITE, ...NOT_NUMBERS])('is none when it is %s', (v) => {
    expect(positiveAmountOf(v)).toBeNull();
  });
});

describe('an amount that is above zero once rounded', () => {
  it.each([
    [0.01, 0.01],
    [1.236, 1.24],
    [12, 12],
  ])('reads %s as %s', (given, expected) => {
    expect(positiveOf(given)).toBe(expected);
  });

  it.each([0, 0.004, -1, ...NOT_FINITE, ...NOT_NUMBERS])('is none when it is %s', (v) => {
    expect(positiveOf(v)).toBeNull();
  });
});

describe('a whole number', () => {
  it.each([0, 3, -3])('is kept when it is %s and nothing is asked of it', (n) => {
    expect(wholeOf(n)).toBe(n);
  });

  it.each([
    [0, 0, 0],
    [1, 1, 1],
    [5, 1, 5],
  ])('reads %s of at least %s as %s', (given, least, expected) => {
    expect(wholeOf(given, least)).toBe(expected);
  });

  it.each([
    [0, 1],
    [-1, 0],
  ])('is none when %s is below %s', (given, least) => {
    expect(wholeOf(given, least)).toBeNull();
  });

  it.each([2.5, ...NOT_FINITE, ...NOT_NUMBERS])('is none when it is %s', (v) => {
    expect(wholeOf(v)).toBeNull();
  });
});

describe('a text', () => {
  it.each([
    ['text', 'text'],
    ['  padded \n', 'padded'],
    ['a b', 'a b'],
  ])('reads %j as %j', (given, expected) => {
    expect(textOf(given)).toBe(expected);
    expect(textOrBlank(given)).toBe(expected);
  });

  it.each(['', '   \n', 5, true, false, undefined])(
    'is none when it is %j, and blank when blank is asked',
    (v) => {
      expect(textOf(v)).toBeNull();
      expect(textOrBlank(v)).toBe('');
    },
  );
});

describe('one of the options', () => {
  const options = ['fixed', 'variable', 'mixed'] as const;

  it.each(options)('reads %s', (option) => {
    expect(oneOf(option, options)).toBe(option);
  });

  it.each(['other', 'Fixed', ' fixed', '', 0, true, undefined])('is none when it is %j', (v) => {
    expect(oneOf(v, options)).toBeNull();
  });

  it('is none without options', () => {
    expect(oneOf('fixed', [])).toBeNull();
  });
});

describe('a yes or a no', () => {
  it.each([
    [true, 'yes'],
    [false, 'no'],
  ])('reads %s as %s', (given, expected) => {
    expect(yesNo(given)).toBe(expected);
  });

  it.each(['yes', 'no', 'true', 1, 0, '', undefined])('is none when it is %j', (v) => {
    expect(yesNo(v)).toBeNull();
  });
});

describe('a date', () => {
  it('reads a day written as yyyy-mm-dd', () => {
    expect(dateOf('2019-02-15')).toStrictEqual({ y: 2019, m: 2, d: 15 });
    expect(isoOf('2019-02-15')).toBe('2019-02-15');
  });

  it.each(['2019-02-30', '2019-13-15', '15/02/2019', 'garbage', '', 20_190_215, true, undefined])(
    'is none when it is %j',
    (v) => {
      expect(dateOf(v)).toBeNull();
      expect(isoOf(v)).toBeNull();
    },
  );
});
