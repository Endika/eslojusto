import { describe, expect, it } from 'vitest';
import { CAMPOS, HOJAS, PARTIDAS } from '../../src/calculadora/formulario';
import { PREGUNTAS } from '../../src/contenido/temas';
import {
  CATALOGO,
  SECCIONES,
  CAMPOS_MEDIBLES,
  TEMAS_AYUDA,
  camposCambiados,
  cuboDiferencia,
  cuboIntento,
  cuboSegundosRevision,
  cuboSegundosSeccion,
  eventoValido,
  instantanea,
  propsRevision,
  resultadoDe,
} from '../../src/medicion/eventos';
import { eventoLimpio } from '../../src/medicion/limpiar';
import { OPCIONES_POSTHOG } from '../../src/medicion/posthog';
import type { Estado, ResultadoPartida } from '../../src/motor/comparar';
import { calcularParo } from '../../src/motor/paro';
import { revisarFiniquito, type Revision } from '../../src/motor/revisar';
import type { EntradaFiniquito, PartidaId } from '../../src/motor/tipos';

const entrada: EntradaFiniquito = {
  causa: 'fin_temporal',
  tipoTemporal: 'circunstancias',
  fechaAlta: { y: 2010, m: 3, d: 1 },
  fechaBaja: { y: 2026, m: 9, d: 15 },
  salarioMensual: 1500,
  pagasProrrateadas: false,
  numeroPagas: 2,
  importePaga: 1500,
  devengoPagas: 'semestral',
  diasVacacionesAnuales: 30,
  diasVacacionesDisfrutadas: 10,
};
const hoy = { y: 2026, m: 10, d: 6 };
const paro = calcularParo(entrada, 1);

function revision(...estados: [PartidaId, Estado, number | null, number | null][]): Revision {
  const partidas: ResultadoPartida[] = estados.map(([id, estado, cifraEmpresa, diferencia]) => ({
    partida: {
      id,
      titulo: id,
      sentido: id === 'descuento_preaviso' ? 'descuento' : 'abono',
      rango: estado === 'no_comprobable' ? null : { minimo: 1, maximo: 1 },
      calculo: '',
      dependeDeConvenio: false,
      segunTuDato: false,
      fuentes: [],
    },
    cifraEmpresa,
    estado,
    diferencia,
  }));
  return { partidas, referenciaImprocedente: null, noRevisado: [], noRevisadoCodigos: [] };
}

describe('cubos', () => {
  it('diferencia, en cada borde', () => {
    expect(cuboDiferencia(0)).toBe('0');
    expect(cuboDiferencia(0.01)).toBe('<100');
    expect(cuboDiferencia(99.99)).toBe('<100');
    expect(cuboDiferencia(100)).toBe('100-500');
    expect(cuboDiferencia(500)).toBe('100-500');
    expect(cuboDiferencia(500.01)).toBe('500-2000');
    expect(cuboDiferencia(2000)).toBe('500-2000');
    expect(cuboDiferencia(2000.01)).toBe('>2000');
  });
  it('segundos de una sección', () => {
    expect(cuboSegundosSeccion(0)).toBe('<10');
    expect(cuboSegundosSeccion(9.99)).toBe('<10');
    expect(cuboSegundosSeccion(10)).toBe('10-30');
    expect(cuboSegundosSeccion(30)).toBe('10-30');
    expect(cuboSegundosSeccion(30.5)).toBe('30-60');
    expect(cuboSegundosSeccion(60)).toBe('30-60');
    expect(cuboSegundosSeccion(180)).toBe('60-180');
    expect(cuboSegundosSeccion(180.1)).toBe('>180');
  });
  it('segundos hasta la revisión', () => {
    expect(cuboSegundosRevision(59.9)).toBe('<60');
    expect(cuboSegundosRevision(60)).toBe('60-180');
    expect(cuboSegundosRevision(180)).toBe('60-180');
    expect(cuboSegundosRevision(600)).toBe('180-600');
    expect(cuboSegundosRevision(600.1)).toBe('>600');
  });
  it('intento', () => {
    expect([1, 2, 3, 9].map(cuboIntento)).toEqual(['1', '2', '3+', '3+']);
  });
});

describe('el guardián del catálogo', () => {
  it('acepta un evento bien formado de cada tipo', () => {
    expect(eventoValido('idioma_navegador', { idioma: 'ja' })).toBe(true);
    expect(eventoValido('idioma_traducido', { idioma: 'desconocido' })).toBe(true);
    expect(eventoValido('seccion_vista', { seccion: 'salario' })).toBe(true);
    expect(eventoValido('seccion_completada', { seccion: 'fechas', segundos: '10-30' })).toBe(true);
    expect(eventoValido('atras', { de: 'salario', a: 'causa' })).toBe(true);
    expect(eventoValido('seccion_vista', { seccion: 'temporal' })).toBe(true);
    expect(eventoValido('seccion_completada', { seccion: 'pagas', segundos: '<10' })).toBe(true);
    expect(eventoValido('atras', { de: 'pagas', a: 'salario' })).toBe(true);
    expect(eventoValido('seccion_vista', { seccion: 'prorrateo' })).toBe(true);
    expect(eventoValido('atras', { de: 'resultado', a: 'prorrateo' })).toBe(true);
    expect(
      eventoValido('error_validacion', { seccion: 'prorrateo', campo: 'pagasProrrateadas' }),
    ).toBe(true);
    // The «No lo sé» checkbox is a form control, not an engine field: it is never a measured name.
    expect(
      eventoValido('error_validacion', {
        seccion: 'vacaciones',
        campo: 'diasVacacionesDisfrutadasNoLoSe',
      }),
    ).toBe(false);
    expect(eventoValido('error_validacion', { seccion: 'pagas', campo: 'importePaga' })).toBe(true);
    expect(eventoValido('error_validacion', { seccion: 'salario', campo: 'salarioMensual' })).toBe(
      true,
    );
    expect(eventoValido('ayuda_abierta', { tema: 'faq-datos' })).toBe(true);
    expect(eventoValido('detalle_abierto', { partida: 'vacaciones' })).toBe(true);
    expect(eventoValido('empezar_de_nuevo', {})).toBe(true);
    expect(eventoValido('error_js', { tipo: 'TypeError', origen: 'main.CzX1-a.js:1' })).toBe(true);
  });

  it('rechaza una cifra en lugar de su cubo', () => {
    const props = propsRevision({
      revision: revision(['salario_pendiente', 'por_debajo', 100, 412.5]),
      entrada,
      intento: 1,
      cambios: [],
      segundos: 90,
      paro,
      otrosContratos: 0,
    });
    expect(eventoValido('revision_hecha', props)).toBe(true);
    expect(eventoValido('revision_hecha', { ...props, diferencia: 412.5 })).toBe(false);
    expect(eventoValido('revision_hecha', { ...props, segundos: 90 })).toBe(false);
    expect(eventoValido('revision_hecha', { ...props, por_debajo: 7 })).toBe(false);
    expect(eventoValido('revision_hecha', { ...props, por_debajo: 1.5 })).toBe(false);
    expect(eventoValido('revision_hecha', { ...props, cambios: ['1500'] })).toBe(false);
    expect(eventoValido('revision_hecha', { ...props, cambios: 'salarioMensual' })).toBe(false);
  });

  it('rechaza un valor que no es un nombre de campo', () => {
    expect(eventoValido('error_validacion', { seccion: 'salario', campo: '1500' })).toBe(false);
    expect(eventoValido('error_validacion', { seccion: 'salario', campo: '2010-03-01' })).toBe(
      false,
    );
    expect(eventoValido('seccion_vista', { seccion: 'hoja' })).toBe(false);
    expect(eventoValido('idioma_navegador', { idioma: '1500' })).toBe(false);
    expect(eventoValido('idioma_navegador', { idioma: 'ja-JP' })).toBe(false);
    expect(eventoValido('error_js', { tipo: 'No hay 1.500 €', origen: 'main.js:1' })).toBe(false);
    expect(eventoValido('error_js', { tipo: 'TypeError', origen: '1500' })).toBe(false);
    expect(eventoValido('ayuda_abierta', { tema: 'faq-otra' })).toBe(false);
  });

  it('rechaza propiedades de más, de menos y eventos desconocidos', () => {
    expect(eventoValido('seccion_vista', { seccion: 'causa', salario: 'causa' })).toBe(false);
    expect(eventoValido('seccion_completada', { seccion: 'causa' })).toBe(false);
    expect(eventoValido('empezar_de_nuevo', { importe: '0' })).toBe(false);
    expect(eventoValido('salario', { seccion: 'causa' })).toBe(false);
    expect(eventoValido('toString', {})).toBe(false);
    expect(eventoValido('seccion_vista', null)).toBe(false);
    expect(eventoValido('seccion_vista', ['causa'])).toBe(false);
  });

  it('cubre cada evento del catálogo', () => {
    expect(Object.keys(CATALOGO).toSorted()).toEqual(
      [
        'atras',
        'ayuda_abierta',
        'detalle_abierto',
        'empezar_de_nuevo',
        'error_js',
        'error_validacion',
        'idioma_navegador',
        'idioma_traducido',
        'revision_hecha',
        'seccion_completada',
        'seccion_vista',
      ].toSorted(),
    );
  });
});

describe('el catálogo sigue al formulario', () => {
  it('cada campo del formulario es un campo medible', () => {
    for (const hoja of HOJAS)
      for (const campo of CAMPOS[hoja]) expect(CAMPOS_MEDIBLES).toContain(campo);
  });
  it('cada partida tiene su cifra medible', () => {
    for (const id of PARTIDAS) expect(CAMPOS_MEDIBLES).toContain(`cifra_${id}`);
  });
  it('cada hoja del formulario, y el resultado, es una sección medible', () => {
    expect(SECCIONES).toEqual([...HOJAS, 'resultado']);
  });
  it('cada pregunta frecuente es un tema de ayuda', () => {
    expect(TEMAS_AYUDA).toEqual(PREGUNTAS.map((id) => `faq-${id}`));
  });
});

describe('revision_hecha', () => {
  it('resultado: falta', () => {
    expect(resultadoDe(revision(['vacaciones', 'por_debajo', 10, 50]))).toBe('falta');
    expect(resultadoDe(revision(['descuento_preaviso', 'descuento_mayor', 900, 300]))).toBe(
      'falta',
    );
  });
  it('resultado: todo_coincide', () => {
    expect(
      resultadoDe(
        revision(
          ['salario_pendiente', 'coincide', 1, null],
          ['vacaciones', 'por_encima', 9, null],
          ['pagas_extra', 'no_comprobable', null, null],
        ),
      ),
    ).toBe('todo_coincide');
  });
  it('resultado: solo_no_comprobable', () => {
    expect(
      resultadoDe(
        revision(
          ['vacaciones', 'no_comprobable', 300, null],
          ['indemnizacion', 'sin_cifra_empresa', null, null],
        ),
      ),
    ).toBe('solo_no_comprobable');
  });
  it('resultado: sin_cifras', () => {
    expect(
      resultadoDe(
        revision(
          ['salario_pendiente', 'sin_cifra_empresa', null, null],
          ['vacaciones', 'no_comprobable', null, null],
        ),
      ),
    ).toBe('sin_cifras');
  });

  it('cuenta estados y suma solo lo que falta', () => {
    const props = propsRevision({
      revision: revision(
        ['salario_pendiente', 'por_debajo', 100, 60],
        ['vacaciones', 'por_debajo', 100, 50],
        ['pagas_extra', 'coincide', 300, null],
        ['indemnizacion', 'por_encima', 40000, null],
        ['preaviso_empresa', 'no_comprobable', null, null],
        ['descuento_preaviso', 'descuento_mayor', 500, 3000],
      ),
      entrada,
      intento: 2,
      cambios: ['salarioMensual'],
      segundos: 200,
      paro,
      otrosContratos: 0,
    });
    expect(props).toEqual({
      causa: 'fin_temporal',
      tipo_temporal: 'circunstancias',
      pagas: 'semestral',
      cifras_metidas: 5,
      por_debajo: 2,
      coinciden: 1,
      por_encima: 1,
      no_comprobables: 1,
      descuento_mayor: true,
      diferencia: '100-500',
      resultado: 'falta',
      intento: '2',
      cambios: ['salarioMensual'],
      segundos: '180-600',
      paro: 'con_cifras',
      otros_contratos: '0',
    });
    expect(eventoValido('revision_hecha', props)).toBe(true);
  });

  it('pagas y tipo temporal salen de la entrada, nunca de un texto', () => {
    const base = {
      revision: revision(),
      intento: 1,
      cambios: [],
      segundos: 1,
      paro,
      otrosContratos: 0,
    } as const;
    const con = (e: Partial<EntradaFiniquito>) =>
      propsRevision({ ...base, entrada: { ...entrada, ...e } });
    expect(con({ pagasProrrateadas: true }).pagas).toBe('prorrateadas');
    expect(con({ numeroPagas: 0 }).pagas).toBe('sin_pagas');
    expect(con({ devengoPagas: 'anual' }).pagas).toBe('anual');
    expect(con({ devengoPagas: 'no_lo_se' }).pagas).toBe('no_lo_se');
    expect(con({ causa: 'dimision' }).tipo_temporal).toBe('no_aplica');
  });

  it('las vacaciones disfrutadas desconocidas (null) se ven como un cambio, sin su valor', () => {
    const antes = instantanea(entrada, {});
    const ahora = instantanea({ ...entrada, diasVacacionesDisfrutadas: null }, {});
    expect(camposCambiados(antes, ahora)).toEqual(['diasVacacionesDisfrutadas']);
  });

  it('una revisión real del motor pasa el guardián', () => {
    const r = revisarFiniquito(entrada, { indemnizacion: 40000 }, hoy);
    if (!r.ok) throw new Error('entrada no válida');
    const props = propsRevision({
      revision: r.revision,
      entrada,
      intento: 1,
      cambios: [],
      segundos: 30,
      paro,
      otrosContratos: 0,
    });
    expect(eventoValido('revision_hecha', props)).toBe(true);
    expect(JSON.stringify(props)).not.toMatch(/1500|40000|2010|2026/);
  });
});

describe('revision_hecha: el paro', () => {
  const base = { revision: revision(), entrada, intento: 1, cambios: [], segundos: 1 } as const;
  const props = (p: ReturnType<typeof calcularParo>, otrosContratos = 0) =>
    propsRevision({ ...base, paro: p, otrosContratos });

  it('dice si hubo cifras, sin cifras o no aplica, y nada más', () => {
    expect(props(paro).paro).toBe('con_cifras');
    expect(props(calcularParo({ ...entrada, causa: 'dimision' }, null)).paro).toBe('no_aplica');
    const corto = { ...entrada, fechaAlta: { y: 2026, m: 6, d: 1 } };
    expect(props(calcularParo(corto, 2)).paro).toBe('sin_cifras');
  });

  it('cuenta los otros contratos en un tramo, nunca sus fechas', () => {
    expect([0, 1, 2, 3, 7].map((n) => props(paro, n).otros_contratos)).toEqual([
      '0',
      '1',
      '2',
      '3+',
      '3+',
    ]);
  });

  it('el número de hijos no cabe en ninguna propiedad', () => {
    const p = props(paro, 1);
    expect(eventoValido('revision_hecha', p)).toBe(true);
    expect(eventoValido('revision_hecha', { ...p, hijos: 1 })).toBe(false);
    expect(eventoValido('revision_hecha', { ...p, paro: 1 })).toBe(false);
    expect(eventoValido('revision_hecha', { ...p, otros_contratos: 3 })).toBe(false);
    expect(eventoValido('revision_hecha', { ...p, otros_contratos: '2025-01-01' })).toBe(false);
    expect(JSON.stringify(p)).not.toMatch(/hijos|20\d\d/);
  });

  it('un error en una fila de otros contratos se mide por el nombre de la lista', () => {
    expect(eventoValido('error_validacion', { seccion: 'otros', campo: 'otrosContratos' })).toBe(
      true,
    );
    expect(
      eventoValido('error_validacion', { seccion: 'otros', campo: 'otrosContratos.0.fechaAlta' }),
    ).toBe(false);
    expect(eventoValido('error_validacion', { seccion: 'hijos', campo: 'hijos' })).toBe(true);
  });
});

describe('cambios', () => {
  it('lista solo los nombres de lo que cambió', () => {
    const antes = instantanea(entrada, { indemnizacion: 40000 });
    const ahora = instantanea(
      { ...entrada, salarioMensual: 1600, fechaBaja: { y: 2026, m: 9, d: 16 } },
      { indemnizacion: 40000, vacaciones: 12 },
    );
    const cambios = camposCambiados(antes, ahora);
    expect(cambios).toEqual(['fechaBaja', 'salarioMensual', 'cifra_vacaciones']);
    expect(JSON.stringify(cambios)).not.toMatch(/\d/);
  });
  it('la primera revisión no tiene cambios y una idéntica tampoco', () => {
    const a = instantanea(entrada, {});
    expect(camposCambiados(null, a)).toEqual([]);
    expect(camposCambiados(a, instantanea({ ...entrada }, {}))).toEqual([]);
  });
});

describe('opciones de PostHog', () => {
  it('sin cookies, sin perfiles, sin grabación ni nada que se cargue de fuera', () => {
    expect(OPCIONES_POSTHOG).toMatchObject({
      api_host: 'https://eu.i.posthog.com',
      persistence: 'memory',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      person_profiles: 'never',
      advanced_disable_flags: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      capture_exceptions: false,
      before_send: eventoLimpio,
    });
  });
});
