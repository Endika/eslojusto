// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  claveDuracion,
  conNotaVacaciones,
  estadoVisible,
  pintarParo,
  pintarRevision,
  textoEstado,
} from '../../src/calculadora/render';
import { erroresDeHoja, leerDatosParo, leerFormulario } from '../../src/calculadora/formulario';
import { calcularParo, type Hijos } from '../../src/motor/paro';
import type { OtrosContratos } from '../../src/motor/tipos';
import { t } from '../../src/i18n';
import { revisarFiniquito } from '../../src/motor/revisar';
import type { EntradaFiniquito } from '../../src/motor/tipos';

const dimision: EntradaFiniquito = {
  causa: 'dimision',
  fechaAlta: { y: 2022, m: 1, d: 10 },
  fechaBaja: { y: 2026, m: 9, d: 15 },
  salarioMensual: 1850,
  pagasProrrateadas: true,
  numeroPagas: 2,
  importePaga: 0,
  devengoPagas: 'no_lo_se',
  diasVacacionesAnuales: 30,
  diasVacacionesDisfrutadas: 0,
};
const hoy = { y: 2026, m: 10, d: 6 };
const tr = (clave: Parameters<typeof t>[1]) => t('es', clave);

function indemnizacion(cifra?: number) {
  const r = revisarFiniquito(dimision, cifra === undefined ? {} : { indemnizacion: cifra }, hoy);
  if (!r.ok) throw new Error('entrada no válida');
  const p = r.revision.partidas.find((x) => x.partida.id === 'indemnizacion');
  if (!p) throw new Error('sin partida de indemnización');
  return p;
}

describe('indemnización que la ley fija en cero', () => {
  it('sin cifra de la empresa: estado neutro, ni «coincide» ni «no has metido la cifra»', () => {
    const p = indemnizacion();
    expect(estadoVisible(p)).toBe('sin_indemnizacion');
    expect(textoEstado(p, tr)).toBe('No te corresponde indemnización por ley en este caso');
  });
  it('con cifra de la empresa: comparación normal', () => {
    expect(estadoVisible(indemnizacion(0))).toBe('coincide');
    expect(estadoVisible(indemnizacion(500))).toBe('por_encima');
  });
});

const revisar = (o: Partial<EntradaFiniquito>, cifras = {}) => {
  const r = revisarFiniquito({ ...dimision, ...o }, cifras, hoy);
  if (!r.ok) throw new Error('entrada no válida');
  return r.revision;
};
const trV = (clave: Parameters<typeof t>[1], v?: Record<string, string | number>) =>
  t('es', clave, v);

describe('indemnización cero según la causa', () => {
  it('disciplinario: condicional, con la referencia y el plazo, sin afirmar que no corresponde', () => {
    const rev = revisar({ causa: 'disciplinario' });
    const p = rev.partidas.find((x) => x.partida.id === 'indemnizacion');
    if (!p) throw new Error('sin indemnización');
    const texto = textoEstado(p, trV, rev.referenciaImprocedente);
    expect(texto).toMatch(/^Si el despido es procedente, no hay indemnización \(art\. 55\.7 ET\)/);
    expect(texto).toContain('20 días hábiles (art. 59.3 ET)');
    expect(texto).toMatch(/la referencia sería \d{1,3}(\.\d{3})*,\d{2}\s€/);
    expect(texto).not.toContain('No te corresponde');
  });
});

describe('vacaciones disfrutadas desconocidas', () => {
  it('dice qué falta, no el convenio', () => {
    const p = revisar({ diasVacacionesDisfrutadas: null }).partidas.find(
      (x) => x.partida.id === 'vacaciones',
    );
    if (!p) throw new Error('sin vacaciones');
    expect(textoEstado(p, trV)).toBe('No se puede comprobar sin los días que has disfrutado');
  });
});

function contenedor(): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = `
    <div data-partidas></div><ul data-no-revisado></ul>
    <template data-plantilla="partida">
      <section data-partida>
        <span data-pestana-numero></span>
        <h3 data-titulo></h3>
        <p><svg data-marca><use></use></svg><span data-estado-texto></span></p>
        <p data-cita hidden></p>
        <dl data-cifras><dt data-rango-etiqueta></dt><dd data-rango></dd><dd data-empresa></dd></dl>
        <p data-segun hidden></p>
        <p data-convenio hidden>convenio</p>
        <p data-referencia hidden></p>
        <p data-calculo></p>
        <ul data-fuentes></ul>
      </section>
    </template>
    <template data-plantilla="fuente">
      <li><a></a><span data-vigencia hidden></span></li>
    </template>`;
  return div;
}

describe('pintarRevision', () => {
  it('cada fuente muestra su fecha de vigencia', () => {
    const c = contenedor();
    pintarRevision(c, revisar({}), trV);
    const vacaciones = c.querySelector('[data-partida="vacaciones"]');
    const vigencia = vacaciones?.querySelector<HTMLElement>('[data-vigencia]');
    expect(vigencia?.hidden).toBe(false);
    expect(vigencia?.textContent).toBe('en vigor desde 13-11-2015');
  });

  it('lo que el convenio puede mejorar lleva su nota; lo demás no', () => {
    const c = contenedor();
    pintarRevision(
      c,
      revisar({ pagasProrrateadas: false, importePaga: 1850, devengoPagas: 'anual' }),
      trV,
    );
    const nota = (id: string) =>
      c.querySelector(`[data-partida="${id}"] [data-convenio]`) as HTMLElement | null;
    expect(nota('vacaciones')?.hidden).toBe(false);
    expect(nota('pagas_extra')?.hidden).toBe(false);
    expect(nota('salario_pendiente')?.hidden).toBe(true);
    expect(nota('descuento_preaviso')?.hidden).toBe(true);
  });

  it('disciplinario: la referencia va en el estado, no repetida debajo', () => {
    const c = contenedor();
    pintarRevision(c, revisar({ causa: 'disciplinario' }), trV);
    const hoja = c.querySelector('[data-partida="indemnizacion"]');
    expect(hoja?.querySelector('[data-estado-texto]')?.textContent).toContain('referencia sería');
    expect(hoja?.querySelector<HTMLElement>('[data-referencia]')?.hidden).toBe(true);
  });
});

describe('leerFormulario: «No lo sé» en las vacaciones disfrutadas', () => {
  function formulario(noLoSe: boolean): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="causa" value="dimision">
      <input name="fechaAlta" value="2022-01-10"><input name="fechaBaja" value="2026-09-15">
      <input name="pagasProrrateadas" value="si"><input name="salarioMensual" value="1850">
      <input name="numeroPagas" value="2"><input name="diasVacacionesAnuales" value="30">
      <input name="diasVacacionesDisfrutadas" value="" ${noLoSe ? 'disabled' : ''}>
      ${noLoSe ? '<input name="diasVacacionesDisfrutadasNoLoSe" value="si">' : ''}`;
    return form;
  }
  it('marcada: el motor recibe null', () => {
    const r = leerFormulario(formulario(true));
    expect('entrada' in r && r.entrada.diasVacacionesDisfrutadas).toBeNull();
  });
  it('sin marcar y en blanco: falta el dato, sin valor por defecto', () => {
    const r = leerFormulario(formulario(false));
    expect('errores' in r && r.errores.map((e) => e.campo)).toEqual(['diasVacacionesDisfrutadas']);
  });
});

function hojaParo(): HTMLElement {
  const div = document.createElement('div');
  div.dataset['revision'] = '';
  div.innerHTML = `
    <section data-paro>
      <p><svg data-paro-marca><use></use></svg><span data-paro-estado-texto></span></p>
      <p data-paro-motivo></p>
      <p data-paro-no>causa justa</p>
      <div data-paro-si>
        <p data-paro-cuantia></p><p data-paro-jornada>jornada</p>
        <p data-paro-sin-hijos hidden></p><p data-paro-descuento></p>
        <p data-paro-duracion></p><p data-paro-duracion-nota></p><p data-paro-carencia></p>
      </div>
      <ul data-paro-fuentes></ul>
    </section>
    <template data-plantilla="fuente">
      <li><a></a><span data-vigencia hidden></span></li>
    </template>`;
  const hoja = div.querySelector<HTMLElement>('[data-paro]');
  if (!hoja) throw new Error('sin hoja');
  return hoja;
}

// Despido objetivo, 2 000 € × 12 at 70 % gives 1.400 €, the cap with one child.
const objetivo: EntradaFiniquito = { ...dimision, causa: 'objetivo', salarioMensual: 2000 };

function paro(e: EntradaFiniquito, hijos: Hijos, otros?: OtrosContratos) {
  const hoja = hojaParo();
  pintarParo(hoja, calcularParo(e, hijos, otros), e.causa, hijos, trV);
  const texto = (sel: string) => hoja.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const oculto = (sel: string) => hoja.querySelector<HTMLElement>(sel)?.hidden;
  return { hoja, texto, oculto };
}

describe('pintarParo', () => {
  it('despido objetivo con un hijo: cifras en euros enteros, «al menos» y su artículo', () => {
    const { hoja, texto, oculto } = paro(objetivo, 1);
    expect(hoja.dataset['estado']).toBe('con_cifras');
    expect(texto('[data-paro-estado-texto]')).toBe(
      'Esta causa da derecho a paro si cumples el resto de requisitos',
    );
    expect(texto('[data-paro-motivo]')).toContain('(art. 267.1.a.4.º LGSS)');
    expect(texto('[data-paro-cuantia]')).toBe(
      'Serían unos 1.400 € al mes los primeros 6 meses y unos 1.200 € después, en bruto.',
    );
    expect(texto('[data-paro-descuento]')).toMatch(/^De ahí se descuentan unos 97 € al mes/);
    expect(texto('[data-paro-duracion]')).toMatch(
      /^Al menos unos 540 días \(18 meses\) solo por este trabajo\./,
    );
    expect(texto('[data-paro-carencia]')).toMatch(/^Solo con este contrato ya tienes los 360/);
    expect(oculto('[data-paro-no]')).toBe(true);
    expect(oculto('[data-paro-sin-hijos]')).toBe(true);
    expect(hoja.querySelector('[data-paro-fuentes] [data-vigencia]')?.textContent).toMatch(
      /^en vigor desde \d{2}-\d{2}-\d{4}$/,
    );
  });

  it('sin decir los hijos: el rango del tope sin hijos al de 2 o más', () => {
    const alto = { ...objetivo, salarioMensual: 3000 };
    const { texto, oculto } = paro(alto, null);
    expect(texto('[data-paro-cuantia]')).toBe(
      'Serían entre 1.225 € y 1.575 € al mes los primeros 6 meses y entre 1.225 € y 1.575 € después, en bruto.',
    );
    expect(oculto('[data-paro-sin-hijos]')).toBe(false);
  });

  it('baja voluntaria: no da derecho, con la causa justa y sin cifras', () => {
    const { hoja, texto, oculto } = paro(dimision, null);
    expect(hoja.dataset['estado']).toBe('no_aplica');
    expect(texto('[data-paro-estado-texto]')).toBe('No da derecho a paro');
    expect(texto('[data-paro-motivo]')).toContain('(art. 267.2.a LGSS)');
    expect(oculto('[data-paro-no]')).toBe(false);
    expect(oculto('[data-paro-si]')).toBe(true);
  });

  it('menos de 180 días: sin cifras y «depende de tus últimas nóminas»', () => {
    const corto = { ...objetivo, fechaAlta: { y: 2026, m: 5, d: 1 } };
    const { hoja, texto, oculto } = paro(corto, 0);
    expect(hoja.dataset['estado']).toBe('sin_cifras');
    expect(texto('[data-paro-cuantia]')).toMatch(/^Depende de tus últimas nóminas/);
    expect(texto('[data-paro-cuantia]')).not.toMatch(/€/);
    expect(oculto('[data-paro-descuento]')).toBe(true);
    expect(texto('[data-paro-duracion]')).toMatch(/^Depende de lo que hayas cotizado/);
    expect(texto('[data-paro-carencia]')).toMatch(/^Con este contrato llevas 138 días/);
  });

  const corto = {
    ...objetivo,
    fechaAlta: { y: 2026, m: 1, d: 1 },
    fechaBaja: { y: 2026, m: 8, d: 31 },
  };
  const filas = [
    { fechaAlta: { y: 2025, m: 3, d: 1 }, fechaBaja: { y: 2025, m: 10, d: 31 } },
    { fechaAlta: { y: 2024, m: 3, d: 1 }, fechaBaja: { y: 2024, m: 10, d: 31 } },
  ];

  it('otros contratos sin paro después: «unos D días», nunca «exactamente»', () => {
    const { texto } = paro(corto, 0, { contratos: filas, paroCobradoDespues: false });
    expect(texto('[data-paro-duracion]')).toBe(
      'Unos 240 días (8 meses), con las fechas que has puesto.',
    );
    expect(texto('[data-paro-carencia]')).toMatch(/sumas 733 días cotizados/);
    expect(texto('[data-paro-duracion-nota]')).toContain('art. 269.4 LGSS');
  });

  it('otros contratos con «No lo sé»: «hasta unos D días» con la razón', () => {
    const { texto } = paro(corto, 0, { contratos: filas, paroCobradoDespues: null });
    expect(texto('[data-paro-duracion]')).toBe(
      'Hasta unos 240 días (8 meses); si cobraste paro después de alguno de estos contratos, esos días ya se usaron y puede ser menos (art. 269.2 LGSS).',
    );
    expect(texto('[data-paro-carencia]')).toMatch(/que no hayas usado ya para otro paro/);
  });

  it('«hasta» 0 días no se lee como «hasta 0 días»', () => {
    const { texto, oculto } = paro(corto, 0, {
      contratos: filas.slice(0, 1),
      paroCobradoDespues: true,
    });
    expect(texto('[data-paro-duracion]')).toMatch(/^Hasta unos 120 días/);
    const solo = paro({ ...corto, fechaAlta: { y: 2026, m: 6, d: 1 } }, 0, {
      contratos: [{ fechaAlta: { y: 2026, m: 1, d: 1 }, fechaBaja: { y: 2026, m: 1, d: 31 } }],
      paroCobradoDespues: true,
    });
    expect(solo.texto('[data-paro-duracion]')).toMatch(/^Depende de lo que hayas cotizado/);
    expect(solo.texto('[data-paro-duracion]')).not.toMatch(/hasta unos 0/i);
    expect(oculto('[data-paro-duracion-nota]')).toBe(true);
    expect(solo.oculto('[data-paro-duracion-nota]')).toBe(true);
  });

  it('ninguna frase del paro aconseja ni promete una cifra exacta', () => {
    for (const [e, h, o] of [
      [objetivo, 1, undefined],
      [dimision, null, undefined],
      [corto, null, { contratos: filas, paroCobradoDespues: null }],
      [corto, 2, { contratos: filas, paroCobradoDespues: false }],
    ] as const) {
      const t = paro(e, h, o).hoja.textContent ?? '';
      expect(t).not.toMatch(/exactamente|tienes derecho a paro|\bfirma|\breclama|\bdemanda\b/i);
    }
  });
});

describe('la frase de la duración', () => {
  it('720 días es el máximo: ni «al menos» ni nota de «algo más»', () => {
    for (const tipo of ['al_menos', 'exacta'] as const) {
      expect(claveDuracion({ tipo, dias: 720 })).toBe('cli.paro.duracion.maximo');
      expect(conNotaVacaciones({ tipo, dias: 720 })).toBe(false);
    }
    expect(trV('cli.paro.duracion.maximo', { dias: '720', meses: '24' })).toBe(
      'Unos 720 días (24 meses), el máximo.',
    );
  });
  it('«hasta» conserva su aviso y no lleva la nota de «algo más»', () => {
    const hasta = { tipo: 'hasta', dias: 720, razon: '' } as const;
    expect(claveDuracion(hasta)).toBe('cli.paro.duracion.hasta');
    expect(conNotaVacaciones(hasta)).toBe(false);
    expect(trV('cli.paro.duracion.hasta')).not.toContain('algo más');
  });
  it('por debajo del máximo, «al menos» y «unos» llevan la nota; 0 días, «depende»', () => {
    expect(claveDuracion({ tipo: 'al_menos', dias: 540 })).toBe('cli.paro.duracion.al_menos');
    expect(conNotaVacaciones({ tipo: 'al_menos', dias: 540 })).toBe(true);
    expect(conNotaVacaciones({ tipo: 'exacta', dias: 240 })).toBe(true);
    expect(claveDuracion({ tipo: 'exacta', dias: 0 })).toBe('cli.paro.duracion.depende');
  });
});

describe('jornada parcial', () => {
  it('800 €/mes: sin cifras y sin descuento, con el motivo de la base mínima', () => {
    const { hoja, texto, oculto } = paro({ ...objetivo, salarioMensual: 800 }, 1);
    expect(hoja.dataset['estado']).toBe('sin_cifras');
    expect(texto('[data-paro-cuantia]')).toBe(
      'Con este salario no podemos estimar la cuantía (puede ser jornada parcial); depende de tus bases de cotización.',
    );
    expect(oculto('[data-paro-descuento]')).toBe(true);
    expect(oculto('[data-paro-jornada]')).toBe(true);
  });
  it('con cifras, la línea de jornada completa sí sale', () => {
    expect(paro(objetivo, 1).oculto('[data-paro-jornada]')).toBe(false);
  });
});

describe('las hojas del paro', () => {
  function formulario(extra: string): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="causa" value="objetivo">
      <input name="fechaAlta" value="2026-01-01"><input name="fechaBaja" value="2026-08-31">
      <input name="pagasProrrateadas" value="si"><input name="salarioMensual" value="2000">
      <input name="numeroPagas" value="2"><input name="diasVacacionesAnuales" value="30">
      <input name="diasVacacionesDisfrutadas" value="0">
      <ol>
        <li data-otro="0">
          <input name="otrosContratos.0.fechaAlta" value="2025-03-01">
          <input name="otrosContratos.0.fechaBaja" value="2025-10-31">
        </li>
        <li data-otro="1">
          <input name="otrosContratos.1.fechaAlta" value="2025-03-01">
          <input name="otrosContratos.1.fechaBaja" value="2026-12-31">
        </li>
      </ol>
      ${extra}`;
    return form;
  }

  it('hijos sin contestar es un error de su hoja; «Prefiero no decirlo» vale', () => {
    expect(erroresDeHoja(formulario(''), 'hijos')).toEqual([
      { campo: 'hijos', codigo: 'falta_hijos' },
    ]);
    const noDice = formulario(
      '<input name="hijos" value="no_dice"><input name="otrosContratos" value="no">',
    );
    expect(erroresDeHoja(noDice, 'hijos')).toEqual([]);
    expect(leerDatosParo(noDice)).toEqual({
      datos: { hijos: null, otros: { contratos: [], paroCobradoDespues: null } },
    });
  });

  it('cada error de una fila va a su fila', () => {
    const f = formulario(
      '<input name="otrosContratos" value="si"><input name="paroCobradoDespues" value="no">',
    );
    expect(erroresDeHoja(f, 'otros')).toEqual([
      { campo: 'otrosContratos.1.fechaBaja', codigo: 'otro_contrato_baja_posterior' },
    ]);
  });

  it('con «No» las filas no cuentan; sin causa con paro, no hay datos del paro', () => {
    const f = formulario('<input name="hijos" value="1"><input name="otrosContratos" value="no">');
    expect(leerDatosParo(f)).toEqual({
      datos: { hijos: 1, otros: { contratos: [], paroCobradoDespues: null } },
    });
    const causa = f.querySelector<HTMLInputElement>('[name="causa"]');
    if (causa) causa.value = 'dimision';
    expect(leerDatosParo(f)).toEqual({ datos: null });
  });

  it('con «Sí» hay que contestar si se cobró paro después', () => {
    const f = formulario('<input name="otrosContratos" value="si">');
    expect(erroresDeHoja(f, 'otros').map((e) => e.codigo)).toContain('falta_paroCobradoDespues');
  });

  it('el error del motor vuelve a su fila aunque una fila anterior no se pueda leer', () => {
    const f = formulario(
      '<input name="otrosContratos" value="si"><input name="paroCobradoDespues" value="no">',
    );
    const alta0 = f.querySelector<HTMLInputElement>('[name="otrosContratos.0.fechaAlta"]');
    if (alta0) alta0.value = '';
    expect(erroresDeHoja(f, 'otros')).toEqual([
      { campo: 'otrosContratos.0.fechaAlta', codigo: 'falta_dato' },
      { campo: 'otrosContratos.1.fechaBaja', codigo: 'otro_contrato_baja_posterior' },
    ]);
  });

  it('los errores siguen el orden de la pantalla: la pregunta, luego cada fila', () => {
    const f = formulario('<input name="otrosContratos" value="si">');
    const baja0 = f.querySelector<HTMLInputElement>('[name="otrosContratos.0.fechaBaja"]');
    if (baja0) baja0.value = '';
    expect(erroresDeHoja(f, 'otros').map((e) => e.campo)).toEqual([
      'paroCobradoDespues',
      'otrosContratos.0.fechaBaja',
      'otrosContratos.1.fechaBaja',
    ]);
  });
});
