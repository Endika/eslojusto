// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { isValidEvent } from '../../src/analytics/events';
import { errorProps, sanitizeMessage, stackFrames, watchErrors } from '../../src/analytics/errors';

const ORIGIN = 'https://eslojusto.es';
const PAGE = { origin: ORIGIN, hash: '' };

function withStack(error: Error, stack: string): Error {
  error.stack = stack;
  return error;
}

describe('sanitizeMessage', () => {
  it('keeps the template of a V8 message and drops the quoted name', () => {
    expect(sanitizeMessage("Cannot read properties of undefined (reading 'x')")).toBe(
      "Cannot read properties of undefined (reading '…')",
    );
  });

  it('empties every kind of quoted span', () => {
    expect(sanitizeMessage(`a "Ana García" b 'DNI' c \`salary\``)).toBe('a "…" b \'…\' c `…`');
  });

  it('turns every run of digits into #', () => {
    expect(sanitizeMessage('No se entiende 1.500,25 € en 2024-03-01')).toBe(
      'No se entiende #.#,# € en #-#-#',
    );
  });

  it('collapses whitespace and caps the length at 160', () => {
    expect(sanitizeMessage('a \n\t  b')).toBe('a b');
    expect(sanitizeMessage('x'.repeat(500))).toHaveLength(160);
  });

  it('drops the message when an address survives', () => {
    expect(sanitizeMessage('failed for ana@example.org')).toBe('');
    expect(sanitizeMessage('GET https://evil.example/a failed')).toBe('');
    expect(sanitizeMessage('bad host www.foo')).toBe('');
    expect(sanitizeMessage('visit example.com now')).toBe('');
  });

  it('keeps ordinary property access', () => {
    expect(sanitizeMessage('state.items.map is not a function')).toBe(
      'state.items.map is not a function',
    );
  });

  it('an address inside quotes goes with the quotes', () => {
    expect(sanitizeMessage("bad value 'ana@x.es'")).toBe("bad value '…'");
  });
});

describe('stackFrames', () => {
  it('reads a V8 stack', () => {
    const e = withStack(
      new TypeError('x'),
      [
        'TypeError: x',
        '    at f (https://eslojusto.es/_astro/render.B1.js:1:2345)',
        '    at https://eslojusto.es/_astro/main.A.js?v=1#h:7:9',
        '    at async g (https://eslojusto.es/_astro/main.A.js:3:4)',
      ].join('\n'),
    );
    expect(stackFrames(e, ORIGIN)).toEqual([
      'render.B1.js:1:2345',
      'main.A.js:7:9',
      'main.A.js:3:4',
    ]);
  });

  it('reads a Firefox stack', () => {
    const e = withStack(
      new Error('x'),
      'f@https://eslojusto.es/_astro/render.B1.js:4:5\n@https://eslojusto.es/_astro/main.A.js:1:1\n',
    );
    expect(stackFrames(e, ORIGIN)).toEqual(['render.B1.js:4:5', 'main.A.js:1:1']);
  });

  it('reads a Safari stack, with its native frames', () => {
    const e = withStack(
      new Error('x'),
      'map@[native code]\nf@https://eslojusto.es/_astro/render.B1.js:4:5\nglobal code@https://eslojusto.es/_astro/main.A.js:2:8',
    );
    expect(stackFrames(e, ORIGIN)).toEqual(['render.B1.js:4:5', 'main.A.js:2:8']);
  });

  it('drops extensions, other origins and what the message quotes', () => {
    const e = withStack(
      new TypeError('a\n    at https://evil.example/x.js:1:1'),
      [
        'TypeError: a',
        '    at https://evil.example/x.js:1:1',
        '    at f (chrome-extension://abc/content.js:1:1)',
        '    at f (https://other.example/lib.js:1:1)',
        '    at g (https://eslojusto.es/_astro/main.A.js:3:9)',
        'f@moz-extension://abc/c.js:1:1',
        'f@safari-extension://abc/c.js:1:1',
      ].join('\n'),
    );
    expect(stackFrames(e, ORIGIN)).toEqual(['main.A.js:3:9']);
  });

  it('keeps at most five', () => {
    const lines = Array.from(
      { length: 9 },
      (_, i) => `    at f (https://eslojusto.es/_astro/a.js:${i + 1}:1)`,
    );
    const e = withStack(new Error('x'), `Error: x\n${lines.join('\n')}`);
    expect(stackFrames(e, ORIGIN)).toHaveLength(5);
    expect(stackFrames(e, ORIGIN)[0]).toBe('a.js:1:1');
  });
});

describe('js_error', () => {
  it('sends the kind, frames, version, a message template and the step, nothing typed', () => {
    const e = withStack(
      new TypeError("Cannot read properties of undefined (reading 'salary 1500')"),
      "TypeError: Cannot read properties of undefined (reading 'salary 1500')\n    at f (https://eslojusto.es/_astro/main.CzX1-a.js?x=1500:1:4521)",
    );
    const props = errorProps(e, undefined, { origin: ORIGIN, hash: '#sheet-contract' });
    expect(props).toEqual({
      kind: 'TypeError',
      frames: ['main.CzX1-a.js:1:4521'],
      version: '0.0.0',
      message: "Cannot read properties of undefined (reading '…')",
      step: 'contract',
    });
    expect(isValidEvent('js_error', props)).toBe(true);
  });

  it('falls back on the event position when the error has no stack', () => {
    const props = errorProps(
      null,
      { filename: 'https://eslojusto.es/_astro/main.A.js?v=1#x', lineno: 12, colno: 7 },
      PAGE,
    );
    expect(props.frames).toEqual(['main.A.js:12:7']);
    expect(
      errorProps(null, { filename: 'https://x.es/1500', lineno: 3, colno: 1 }, PAGE).frames,
    ).toEqual([]);
  });

  it('takes the step only from a well-formed hash', () => {
    expect(errorProps(null, undefined, { origin: ORIGIN, hash: '#causa' }).step).toBe('causa');
    expect(errorProps(null, undefined, { origin: ORIGIN, hash: '#Salario=1500' }).step).toBe('');
    expect(errorProps(null, undefined, { origin: ORIGIN, hash: `#${'a'.repeat(31)}` }).step).toBe(
      '',
    );
  });

  it('a non-standard error name, or something that is not an error, goes as other', () => {
    const odd = new Error('x');
    odd.name = 'Salary 1500';
    expect(errorProps(odd, undefined, PAGE).kind).toBe('other');
    expect(errorProps('1500', undefined, PAGE)).toEqual({
      kind: 'other',
      frames: [],
      version: '0.0.0',
      message: '',
      step: '',
    });
  });

  it('listens to errors and rejected promises', () => {
    const seen: unknown[] = [];
    watchErrors(window, (_, props) => seen.push(props));
    const thrown = new ReferenceError('startDate 2010-03-01');
    thrown.stack = '';
    window.dispatchEvent(
      new ErrorEvent('error', { error: thrown, filename: 'main.js', lineno: 7, colno: 3 }),
    );
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = new SyntaxError('40.000,00');
    window.dispatchEvent(rejection);
    expect(seen).toMatchObject([
      { kind: 'ReferenceError', message: 'startDate #-#-#' },
      { kind: 'SyntaxError', message: '#.#,#' },
    ]);
    for (const props of seen) expect(isValidEvent('js_error', props)).toBe(true);
  });
});
