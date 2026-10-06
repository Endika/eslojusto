// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { traductor } from '../../src/i18n/cliente';
import { es } from '../../src/i18n/es';
import {
  idiomaPrincipal,
  idiomaSugerido,
  mostrarOtroIdioma,
  vigilarTraduccion,
} from '../../src/medicion/idioma';

const esperar = () => new Promise((r) => setTimeout(r, 0));

describe('idiomaPrincipal', () => {
  it('toma la subetiqueta primaria del primer idioma', () => {
    expect(idiomaPrincipal(['ja-JP', 'es'])).toBe('ja');
    expect(idiomaPrincipal(['es'])).toBe('es');
    expect(idiomaPrincipal(['ZH-Hant-TW'])).toBe('zh');
  });
  it('sin idiomas, o con uno que no es una etiqueta, es desconocido', () => {
    expect(idiomaPrincipal([])).toBe('desconocido');
    expect(idiomaPrincipal([''])).toBe('desconocido');
    expect(idiomaPrincipal(['1500'])).toBe('desconocido');
    expect(idiomaPrincipal(['x-klingon'])).toBe('desconocido');
  });
});

describe('vigilarTraduccion', () => {
  afterEach(() => {
    document.documentElement.className = '';
    document.documentElement.lang = 'es';
    vi.useRealTimers();
  });

  it('avisa una sola vez con el idioma al que se traduce', async () => {
    const html = document.documentElement;
    html.lang = 'es';
    const avisos: string[] = [];
    vigilarTraduccion(html, (i) => avisos.push(i));
    html.classList.add('translated-ltr');
    html.lang = 'ja';
    await esperar();
    html.lang = 'ko';
    html.className = 'translated-rtl';
    await esperar();
    expect(avisos).toEqual(['ja']);
  });

  it('no avisa por otros cambios de clase', async () => {
    const html = document.documentElement;
    html.lang = 'es';
    const avisos: string[] = [];
    vigilarTraduccion(html, (i) => avisos.push(i));
    html.classList.add('js');
    html.dataset['theme'] = 'dark';
    await esperar();
    expect(avisos).toEqual([]);
  });

  it('si el traductor marca la clase sin cambiar el idioma, avisa como desconocido', async () => {
    vi.useFakeTimers();
    const html = document.documentElement;
    html.lang = 'es';
    const avisos: string[] = [];
    vigilarTraduccion(html, (i) => avisos.push(i));
    html.classList.add('translated-ltr');
    await vi.advanceTimersByTimeAsync(0);
    expect(avisos).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(avisos).toEqual(['desconocido']);
  });
});

const otros = [{ codigo: 'ar-test', nombre: 'Pseudo RTL', url: '/ar-test/finiquito/' }] as const;

describe('idiomaSugerido', () => {
  it('sugiere un idioma publicado que coincide con el del navegador', () => {
    expect(idiomaSugerido(['ar-EG', 'es'], otros, 'es')?.codigo).toBe('ar-test');
  });
  it('nada si el navegador ya está en español, si no hay coincidencia o si no estás en español', () => {
    expect(idiomaSugerido(['es-ES', 'ar'], otros, 'es')).toBeNull();
    expect(idiomaSugerido(['ja-JP'], otros, 'es')).toBeNull();
    expect(idiomaSugerido(['ar'], [], 'es')).toBeNull();
    expect(idiomaSugerido(['ar'], otros, 'ar-test')).toBeNull();
  });
});

describe('la barra «Esta página también está en …»', () => {
  const tr = traductor(es);
  const preparar = () => {
    document.body.innerHTML = `<div class="suelo"></div><script id="otros-idiomas" type="application/json">${JSON.stringify(otros)}</script>`;
    document.documentElement.lang = 'es';
  };
  it('aparece con los textos del diccionario y un enlace, sin redirigir', () => {
    preparar();
    mostrarOtroIdioma(document, ['ar-SA'], tr);
    const barra = document.querySelector('.otro-idioma');
    expect(barra?.textContent).toContain('Esta página también está en');
    const a = barra?.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/ar-test/finiquito/');
    expect(a?.getAttribute('hreflang')).toBe('ar-test');
    expect(a?.textContent).toBe('Pseudo RTL');
    expect(barra?.querySelector('button')?.getAttribute('aria-label')).toBe(
      es['cli.otro_idioma.cerrar'],
    );
  });
  it('el botón de cerrar lleva un icono dibujado, sin glifo', () => {
    preparar();
    mostrarOtroIdioma(document, ['ar'], tr);
    const boton = document.querySelector('.otro-idioma button');
    expect(boton?.textContent).toBe('');
    expect(boton?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(boton?.querySelector('svg path')?.getAttribute('d')).toBeTruthy();
  });

  it('se cierra sin guardar nada', () => {
    preparar();
    localStorage.clear();
    sessionStorage.clear();
    mostrarOtroIdioma(document, ['ar'], tr);
    document.querySelector<HTMLButtonElement>('.otro-idioma button')?.click();
    expect(document.querySelector('.otro-idioma')).toBeNull();
    expect([localStorage.length, sessionStorage.length]).toEqual([0, 0]);
  });

  it('no aparece sin idiomas alternativos, que es lo que publica hoy la web', () => {
    document.body.innerHTML = '<div class="suelo"></div>';
    mostrarOtroIdioma(document, ['ar'], tr);
    expect(document.querySelector('.otro-idioma')).toBeNull();
  });
});
