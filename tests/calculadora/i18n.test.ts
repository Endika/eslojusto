import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { es, type Clave } from '../../src/i18n/es';
import { DICCIONARIOS, t } from '../../src/i18n';
import { IDIOMAS, idiomasConstruidos, type Idioma } from '../../src/i18n/idiomas';
import { traductor } from '../../src/i18n/cliente';
import { textoEstado } from '../../src/calculadora/render';
import { revisarFiniquito } from '../../src/motor/revisar';
import { validar, validarOtrosContratos } from '../../src/motor/validar';
import type { EntradaFiniquito } from '../../src/motor/tipos';

const idiomas = Object.keys(IDIOMAS) as Idioma[];
const claves = Object.keys(es) as Clave[];

describe('idiomas publicados', () => {
  it('el español es el único idioma publicado', () => {
    expect(IDIOMAS.es.publicado).toBe(true);
    expect(idiomas.filter((i) => IDIOMAS[i].publicado)).toEqual(['es']);
  });

  it.each(idiomas.filter((i) => IDIOMAS[i].publicado))('%s tiene todas las claves', (idioma) => {
    for (const clave of claves) expect(DICCIONARIOS[idioma][clave], clave).toBeTruthy();
  });

  it('una compilación normal construye solo los idiomas publicados', () => {
    expect(idiomasConstruidos({})).toEqual(['es']);
    expect(idiomasConstruidos({ PRUEBA_RTL: '1' })).toEqual(['es', 'ar-test']);
  });
});

describe('t()', () => {
  it('interpola {importe}', () => {
    expect(t('es', 'cli.estado.por_debajo', { importe: '12,30 €' })).toBe(
      'Por debajo del mínimo legal: faltan 12,30 €',
    );
  });
  it('deja intacta una variable que no recibe', () => {
    expect(t('es', 'cli.estado.por_debajo')).toBe('Por debajo del mínimo legal: faltan {importe}');
  });
});

describe('pseudo-idioma ar-test', () => {
  it('es RTL, no está publicado y envuelve cada texto en marcas árabes', () => {
    expect(IDIOMAS['ar-test']).toMatchObject({ dir: 'rtl', publicado: false });
    for (const clave of claves) {
      const texto = DICCIONARIOS['ar-test'][clave];
      expect(texto, clave).toMatch(/^[؀-ۿ]/);
      expect(texto, clave).toContain(es[clave]);
    }
  });
  it('conserva las variables', () => {
    expect(t('ar-test', 'cli.estado.por_debajo', { importe: '1.234,56 €' })).toContain(
      'faltan 1.234,56 €',
    );
  });
});

describe('textos del cliente', () => {
  it('el traductor del navegador lee los textos que pinta la página', () => {
    const tr = traductor({ 'cli.estado.coincide': 'Coincide con el mínimo legal' });
    expect(tr('cli.estado.coincide')).toBe('Coincide con el mínimo legal');
  });

  it('cada error del motor lleva un código con su texto en es.ts', () => {
    const malo: EntradaFiniquito = {
      causa: 'fin_temporal',
      fechaAlta: { y: 2026, m: 5, d: 1 },
      fechaBaja: { y: 2026, m: 4, d: 1 },
      salarioMensual: 0,
      pagasProrrateadas: false,
      numeroPagas: 9,
      importePaga: -1,
      devengoPagas: 'no_lo_se',
      diasVacacionesAnuales: 99,
      diasVacacionesDisfrutadas: -1,
      diasPreavisoRecibidos: 200,
    };
    const errores = validar(malo, { y: 2026, m: 10, d: 6 });
    expect(errores.length).toBeGreaterThan(5);
    for (const { codigo, mensaje } of errores) {
      expect(t('es', `cli.error.${codigo}`)).toBe(mensaje);
    }
  });

  it('cada error de otros contratos lleva su texto en es.ts', () => {
    const e: EntradaFiniquito = {
      causa: 'objetivo',
      fechaAlta: { y: 2026, m: 1, d: 1 },
      fechaBaja: { y: 2026, m: 8, d: 31 },
      salarioMensual: 2000,
      pagasProrrateadas: true,
      numeroPagas: 2,
      importePaga: 0,
      devengoPagas: 'no_lo_se',
      diasVacacionesAnuales: 30,
      diasVacacionesDisfrutadas: 0,
    };
    const errores = validarOtrosContratos(e, [
      { fechaAlta: { y: 2024, m: 2, d: 30 }, fechaBaja: { y: 2024, m: 13, d: 1 } },
      { fechaAlta: { y: 2025, m: 5, d: 1 }, fechaBaja: { y: 2025, m: 4, d: 1 } },
      { fechaAlta: { y: 2025, m: 5, d: 1 }, fechaBaja: { y: 2026, m: 12, d: 1 } },
    ]);
    expect(new Set(errores.map((x) => x.codigo)).size).toBe(4);
    for (const { codigo, mensaje } of errores) expect(t('es', `cli.error.${codigo}`)).toBe(mensaje);
  });

  it('el estado sale del diccionario con el importe en formato español', () => {
    const r = revisarFiniquito(
      {
        causa: 'improcedente',
        fechaAlta: { y: 2020, m: 1, d: 1 },
        fechaBaja: { y: 2026, m: 9, d: 15 },
        salarioMensual: 2000,
        pagasProrrateadas: true,
        numeroPagas: 2,
        importePaga: 0,
        devengoPagas: 'no_lo_se',
        diasVacacionesAnuales: 30,
        diasVacacionesDisfrutadas: 0,
      },
      { indemnizacion: 1 },
      { y: 2026, m: 10, d: 6 },
    );
    if (!r.ok) throw new Error('entrada no válida');
    const p = r.revision.partidas.find((x) => x.partida.id === 'indemnizacion');
    if (!p) throw new Error('sin indemnización');
    const tr = (c: Parameters<typeof t>[1], v?: Record<string, string | number>) =>
      t('ar-test', c, v);
    expect(textoEstado(p, tr)).toMatch(/faltan \d{1,3}(\.\d{3})*,\d{2}\s€/);
  });

  it('el motor y la interfaz nombran igual cada partida y lo que no se revisa', () => {
    const r = revisarFiniquito(
      {
        causa: 'objetivo',
        fechaAlta: { y: 2020, m: 1, d: 1 },
        fechaBaja: { y: 2026, m: 9, d: 15 },
        salarioMensual: 2000,
        pagasProrrateadas: false,
        numeroPagas: 3,
        importePaga: 2000,
        devengoPagas: 'no_lo_se',
        diasVacacionesAnuales: 30,
        diasVacacionesDisfrutadas: 0,
      },
      {},
      { y: 2026, m: 10, d: 6 },
    );
    if (!r.ok) throw new Error('entrada no válida');
    for (const { partida } of r.revision.partidas)
      expect(t('es', `cli.partida.${partida.id}`)).toBe(partida.titulo);
    expect(r.revision.noRevisadoCodigos.map((c) => t('es', `cli.no_revisado.${c}`))).toEqual(
      r.revision.noRevisado,
    );
  });
});

const ficheros = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? [p, ...ficheros(p)] : [p];
  });

const compilacionNormal = existsSync('dist') && process.env['PRUEBA_RTL'] !== '1';

describe.skipIf(!compilacionNormal)('una compilación normal no publica ar-test', () => {
  const todos = compilacionNormal ? ficheros('dist') : [];
  it('no hay ninguna ruta /ar-test/', () => {
    expect(todos.filter((p) => p.split(/[\\/]/).includes('ar-test'))).toEqual([]);
  });
  it('ningún HTML, sitemap ni script menciona ar-test', () => {
    const textos = todos.filter((p) => /\.(html|xml|js|txt)$/.test(p));
    expect(textos.length).toBeGreaterThan(0);
    for (const p of textos) expect(readFileSync(p, 'utf8'), p).not.toContain('ar-test');
  });
  it('solo la 404 lleva noindex', () => {
    const conNoindex = todos.filter(
      (p) =>
        p.endsWith('.html') &&
        readFileSync(p, 'utf8').includes('<meta name="robots" content="noindex">'),
    );
    expect(conNoindex.map((p) => p.split(/[\\/]/).pop())).toEqual(['404.html']);
  });
  it('cada página enlaza su versión en español con hreflang y ninguna otra', () => {
    const html = todos.filter((p) => p.endsWith('.html'));
    for (const p of html) {
      const texto = readFileSync(p, 'utf8');
      const enlaces = [...texto.matchAll(/<link[^>]*hreflang="([^"]+)"/g)].map((m) => m[1]);
      // The 404 answers at any address: it is never indexed and announces no alternates.
      const esperados = texto.includes('<meta name="robots" content="noindex">')
        ? []
        : ['es', 'x-default'];
      expect(enlaces.toSorted(), p).toEqual(esperados);
    }
  });
});
