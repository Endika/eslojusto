// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { eventoValido } from '../../src/medicion/eventos';
import { propsDeError, vigilarErrores } from '../../src/medicion/errores';

describe('error_js', () => {
  it('manda el nombre del error y el fichero:línea, nunca el mensaje', () => {
    const props = propsDeError(
      new TypeError('No se entiende 1.500 €'),
      'https://eslojusto.es/_astro/main.CzX1-a.js?v=1#x',
      12,
    );
    expect(props).toEqual({ tipo: 'TypeError', origen: 'main.CzX1-a.js:12' });
    expect(eventoValido('error_js', props)).toBe(true);
  });

  it('saca el origen de la pila cuando el evento no lo trae', () => {
    const e = new RangeError('1500');
    e.stack = 'RangeError: 1500\n    at f (https://eslojusto.es/_astro/render.B1.js:1:2345)';
    expect(propsDeError(e)).toEqual({ tipo: 'RangeError', origen: 'render.B1.js:1' });
  });

  it('una URL dentro del mensaje nunca pasa por origen', () => {
    const e = new TypeError('fallo en https://evil.example/x.js:1:1');
    e.stack = `TypeError: fallo en https://evil.example/x.js:1:1\n    at f (https://eslojusto.es/_astro/main.A.js:3:9)`;
    expect(propsDeError(e).origen).toBe('main.A.js:3');
    const multilinea = new TypeError('a\n    at https://evil.example/x.js:1:1');
    multilinea.stack = `TypeError: a\n    at https://evil.example/x.js:1:1`;
    expect(propsDeError(multilinea).origen).toBe('desconocido');
    const sinMarcos = new Error('https://evil.example/x.js:1:1');
    sinMarcos.stack = 'Error: https://evil.example/x.js:1:1';
    expect(propsDeError(sinMarcos).origen).toBe('desconocido');
  });

  it('lee también las pilas de Firefox y Safari', () => {
    const e = new RangeError('x');
    e.stack = 'f@https://eslojusto.es/_astro/render.B1.js:4:5\n@https://eslojusto.es/x.js:1:1';
    expect(propsDeError(e).origen).toBe('render.B1.js:4');
  });

  it('un nombre que no es de un error estándar, o algo que no es un error, va como otro', () => {
    const raro = new Error('x');
    raro.name = 'Salario 1500';
    expect(propsDeError(raro).tipo).toBe('otro');
    expect(propsDeError('1500')).toEqual({ tipo: 'otro', origen: 'desconocido' });
    expect(propsDeError(null, 'https://x.es/1500', 3).origen).toBe('desconocido');
  });

  it('escucha errores y promesas rechazadas', () => {
    const vistos: unknown[] = [];
    vigilarErrores(window, (_, props) => vistos.push(props));
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new ReferenceError('fechaAlta 2010-03-01'),
        filename: 'https://eslojusto.es/_astro/main.A.js',
        lineno: 7,
      }),
    );
    const rechazo = new Event('unhandledrejection') as Event & { reason?: unknown };
    rechazo.reason = new SyntaxError('40.000,00');
    window.dispatchEvent(rechazo);
    expect(vistos).toEqual([
      { tipo: 'ReferenceError', origen: 'main.A.js:7' },
      { tipo: 'SyntaxError', origen: 'desconocido' },
    ]);
  });
});
