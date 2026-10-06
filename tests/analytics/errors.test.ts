// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isValidEvent } from '../../src/analytics/events';
import { errorProps, watchErrors } from '../../src/analytics/errors';

describe('js_error', () => {
  it('sends the error name and file:line, never the message', () => {
    const props = errorProps(
      new TypeError('No se entiende 1.500 €'),
      'https://eslojusto.es/_astro/main.CzX1-a.js?v=1#x',
      12,
    );
    expect(props).toEqual({ kind: 'TypeError', source: 'main.CzX1-a.js:12' });
    expect(isValidEvent('js_error', props)).toBe(true);
  });

  it('takes the source from the stack when the event lacks it', () => {
    const e = new RangeError('1500');
    e.stack = 'RangeError: 1500\n    at f (https://eslojusto.es/_astro/render.B1.js:1:2345)';
    expect(errorProps(e)).toEqual({ kind: 'RangeError', source: 'render.B1.js:1' });
  });

  it('a URL inside the message never passes as the source', () => {
    const e = new TypeError('failed at https://evil.example/x.js:1:1');
    e.stack = `TypeError: failed at https://evil.example/x.js:1:1\n    at f (https://eslojusto.es/_astro/main.A.js:3:9)`;
    expect(errorProps(e).source).toBe('main.A.js:3');
    const multiline = new TypeError('a\n    at https://evil.example/x.js:1:1');
    multiline.stack = `TypeError: a\n    at https://evil.example/x.js:1:1`;
    expect(errorProps(multiline).source).toBe('unknown');
    const noFrames = new Error('https://evil.example/x.js:1:1');
    noFrames.stack = 'Error: https://evil.example/x.js:1:1';
    expect(errorProps(noFrames).source).toBe('unknown');
  });

  it('also reads Firefox and Safari stacks', () => {
    const e = new RangeError('x');
    e.stack = 'f@https://eslojusto.es/_astro/render.B1.js:4:5\n@https://eslojusto.es/x.js:1:1';
    expect(errorProps(e).source).toBe('render.B1.js:4');
  });

  it('a non-standard error name, or something that is not an error, goes as other', () => {
    const odd = new Error('x');
    odd.name = 'Salary 1500';
    expect(errorProps(odd).kind).toBe('other');
    expect(errorProps('1500')).toEqual({ kind: 'other', source: 'unknown' });
    expect(errorProps(null, 'https://x.es/1500', 3).source).toBe('unknown');
  });

  it('listens to errors and rejected promises', () => {
    const seen: unknown[] = [];
    watchErrors(window, (_, props) => seen.push(props));
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new ReferenceError('startDate 2010-03-01'),
        filename: 'https://eslojusto.es/_astro/main.A.js',
        lineno: 7,
      }),
    );
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = new SyntaxError('40.000,00');
    window.dispatchEvent(rejection);
    expect(seen).toEqual([
      { kind: 'ReferenceError', source: 'main.A.js:7' },
      { kind: 'SyntaxError', source: 'unknown' },
    ]);
  });
});
