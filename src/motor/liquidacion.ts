import { FUENTES } from './fuentes';
import { dias, entre, num } from './dinero';
import {
  comparar,
  diasDelAnio,
  diasDelMes,
  diasNaturales,
  max,
  mesesAniversario,
  mesesDevengo,
  type Fecha,
} from './fecha';
import type { EntradaFiniquito, Partida } from './tipos';

const DIAS_PREAVISO = 15;

export function salarioAnual(e: EntradaFiniquito): number {
  return e.pagasProrrateadas
    ? e.salarioMensual * 12
    : e.salarioMensual * 12 + e.importePaga * e.numeroPagas;
}

const eur = (n: number) => `${num(n)} €`;

export function partidaSalarioPendiente(e: EntradaFiniquito): Partida {
  const { y, m } = e.fechaBaja;
  const desde = max({ y, m, d: 1 }, e.fechaAlta);
  const d = diasNaturales(desde, e.fechaBaja);
  const delMes = diasDelMes(y, m);
  const bajo = Math.min(e.salarioMensual, (e.salarioMensual * d) / 30);
  const alto = (e.salarioMensual * d) / delMes;
  return {
    id: 'salario_pendiente',
    titulo: 'Salario del mes de la baja',
    sentido: 'abono',
    rango: entre(bajo, alto),
    calculo: `${eur(e.salarioMensual)} × ${d} días trabajados del mes, entre ${num(30, 0)} días (mes comercial) y ${delMes} días (mes natural): de ${eur(Math.min(bajo, alto))} a ${eur(Math.max(bajo, alto))}.`,
    dependeDeConvenio: false,
    segunTuDato: false,
    fuentes: [FUENTES.et26],
  };
}

type Metodo = 'dias' | 'meses' | 'aniversario';
const METODOS: readonly Metodo[] = ['dias', 'meses', 'aniversario'];

// Counting months from the alta date only differs from calendar months when the alta falls mid-month inside the period.
const cuentaDesdeAlta = (inicio: Fecha, alta: Fecha): boolean =>
  comparar(alta, inicio) > 0 && alta.d !== 1;

const notaMetodos = (desdeAlta: boolean): string =>
  desdeAlta
    ? ' Las empresas lo calculan por días naturales o por meses (meses enteros más los días sueltos / 30), contando los meses por calendario o desde tu fecha de alta; se muestran las tres cuentas.'
    : ' Las empresas lo calculan por días naturales o por meses (meses enteros más los días del mes en curso / 30); se muestran las dos cuentas.';

export function partidaVacaciones(e: EntradaFiniquito): Partida {
  const { y } = e.fechaBaja;
  const inicio = { y, m: 1, d: 1 };
  const desde = max(inicio, e.fechaAlta);
  const d = diasNaturales(desde, e.fechaBaja);
  const anio = diasDelAnio(y);
  const meses = mesesDevengo(desde, e.fechaBaja);
  const desdeAlta = cuentaDesdeAlta(inicio, e.fechaAlta);
  const mesesAlta = desdeAlta ? mesesAniversario(desde, e.fechaBaja) : meses;
  const porDias = (e.diasVacacionesAnuales * d) / anio;
  const porMeses = (e.diasVacacionesAnuales * meses) / 12;
  const porMesesAlta = (e.diasVacacionesAnuales * mesesAlta) / 12;
  const base = {
    id: 'vacaciones',
    titulo: 'Vacaciones devengadas y no disfrutadas',
    sentido: 'abono',
    dependeDeConvenio: true,
    segunTuDato: e.diasVacacionesAnuales > 30,
    fuentes: [FUENTES.et38],
  } as const;
  let devengo = `${dias(e.diasVacacionesAnuales)} días al año: por días, × ${d}/${anio} días trabajados en ${y} = ${dias(porDias)} días devengados; por meses, × ${dias(meses)}/12 = ${dias(porMeses)} días devengados`;
  if (desdeAlta) {
    devengo += `; por meses desde el alta, × ${dias(mesesAlta)}/12 = ${dias(porMesesAlta)} días devengados`;
  }
  const disfrutadas = e.diasVacacionesDisfrutadas;
  if (disfrutadas === null) {
    return {
      ...base,
      rango: null,
      faltaDato: 'dias_disfrutados',
      calculo: `${devengo}. Sin saber cuántos días has disfrutado este año no se puede comprobar.`,
    };
  }
  const pendientes = [porDias, porMeses, porMesesAlta].map((x) => x - disfrutadas);
  const alto = Math.max(...pendientes);
  if (alto < 0) {
    return {
      ...base,
      rango: null,
      calculo: `${devengo}, menos ${dias(disfrutadas)} disfrutados: has disfrutado más días de los devengados. Que proceda o no un descuento por los días disfrutados de más depende del convenio.`,
    };
  }
  const bajo = Math.max(0, Math.min(...pendientes));
  const mensual = e.salarioMensual / 30;
  const anual = salarioAnual(e) / 365;
  return {
    ...base,
    rango: entre(bajo * Math.min(mensual, anual), alto * Math.max(mensual, anual)),
    calculo: `${devengo}, menos ${dias(disfrutadas)} disfrutados = entre ${dias(bajo)} y ${dias(alto)} días pendientes × ${eur(mensual)} (salario mensual / 30) o ${eur(anual)} (salario anual / 365) al día.${notaMetodos(desdeAlta)}`,
  };
}

type Esquema = 'anual' | 'semestral';
type Paga = 'verano' | 'navidad';

interface Periodo {
  readonly paga: Paga;
  readonly inicio: Fecha;
  readonly fin: Fecha;
}

// Usual payment month(s): summer in June or July, Christmas in December.
const MESES_DE_PAGO: Record<Paga, readonly number[]> = { verano: [6, 7], navidad: [12] };

function periodos(e: EntradaFiniquito, devengo: Esquema): Periodo[] {
  const { y, m } = e.fechaBaja;
  const primerSemestre = m <= 6;
  if (devengo === 'anual') {
    const ini = primerSemestre ? y - 1 : y;
    return [
      { paga: 'verano', inicio: { y: ini, m: 7, d: 1 }, fin: { y: ini + 1, m: 6, d: 30 } },
      { paga: 'navidad', inicio: { y, m: 1, d: 1 }, fin: { y, m: 12, d: 31 } },
    ];
  }
  return primerSemestre
    ? [{ paga: 'verano', inicio: { y, m: 1, d: 1 }, fin: { y, m: 6, d: 30 } }]
    : [{ paga: 'navidad', inicio: { y, m: 7, d: 1 }, fin: { y, m: 12, d: 31 } }];
}

interface Tramo {
  readonly bajo: number;
  readonly alto: number;
}

interface Parte {
  readonly paga: Paga;
  readonly cobrada: boolean;
  readonly desdeAlta: boolean;
  readonly importe: Record<Metodo, number>;
  readonly texto: string;
}

function devengado(e: EntradaFiniquito, devengo: Esquema): Parte[] {
  const mesesPeriodo = devengo === 'anual' ? 12 : 6;
  return periodos(e, devengo).map((p) => {
    const desde = max(p.inicio, e.fechaAlta);
    const hasta = comparar(e.fechaBaja, p.fin) < 0 ? e.fechaBaja : p.fin;
    const d = diasNaturales(desde, hasta);
    const total = diasNaturales(p.inicio, p.fin);
    const meses = mesesDevengo(desde, hasta);
    const desdeAlta = cuentaDesdeAlta(p.inicio, e.fechaAlta);
    const mesesAlta = desdeAlta ? mesesAniversario(desde, hasta) : meses;
    const importe = {
      dias: (e.importePaga * d) / total,
      meses: (e.importePaga * meses) / mesesPeriodo,
      aniversario: (e.importePaga * mesesAlta) / mesesPeriodo,
    };
    let texto = `${eur(e.importePaga)} × ${d}/${total} días = ${eur(importe.dias)} o × ${dias(meses)}/${mesesPeriodo} meses = ${eur(importe.meses)}`;
    if (desdeAlta) {
      texto += ` o × ${dias(mesesAlta)}/${mesesPeriodo} meses desde el alta = ${eur(importe.aniversario)}`;
    }
    return {
      paga: p.paga,
      cobrada: MESES_DE_PAGO[p.paga].includes(e.fechaBaja.m),
      desdeAlta,
      importe,
      texto,
    };
  });
}

// One method applies to every paga; the paga already in the last payroll (A4) and, with a single
// paga, which one it is are independent unknowns.
function escenarios(partes: readonly Parte[], unica: boolean): Tramo[] {
  return METODOS.flatMap((metodo) => {
    const tramos = partes.map((p) => ({
      bajo: p.cobrada ? 0 : p.importe[metodo],
      alto: p.importe[metodo],
    }));
    if (unica) return partes.length < 2 ? [...tramos, { bajo: 0, alto: 0 }] : tramos;
    return [
      {
        bajo: tramos.reduce((s, t) => s + t.bajo, 0),
        alto: tramos.reduce((s, t) => s + t.alto, 0),
      },
    ];
  });
}

const NOTA_COBRADA: Record<Paga, string> = {
  verano:
    ' La paga de verano se suele cobrar en junio o julio: puede ir ya en la nómina de ese mes, así que el mínimo de esa paga parte de 0 €.',
  navidad:
    ' La paga de Navidad se suele cobrar en diciembre: puede ir ya en la nómina de ese mes, así que el mínimo de esa paga parte de 0 €.',
};

export function partidaPagasExtra(e: EntradaFiniquito): Partida | null {
  if (e.pagasProrrateadas || e.numeroPagas <= 0) return null;
  const unica = e.numeroPagas === 1;
  const esquemas: readonly Esquema[] =
    e.devengoPagas === 'no_lo_se' ? ['anual', 'semestral'] : [e.devengoPagas];
  const devs = esquemas.map((x) => devengado(e, x));
  const opciones = devs.flatMap((partes) => escenarios(partes, unica));
  const rango = entre(
    Math.min(...opciones.map((o) => o.bajo)),
    Math.max(...opciones.map((o) => o.alto)),
  );
  const partes = devs.flat();
  const detalle = devs.map((r) => r.map((p) => p.texto).join(' + ')).join('; o bien ');
  let calculo =
    e.devengoPagas === 'no_lo_se'
      ? `Sin saber cómo se devengan las pagas, entre el devengo semestral y el anual (${detalle}).`
      : `Devengo ${e.devengoPagas}: ${detalle}, suponiendo que no se ha cobrado nada del periodo abierto.`;
  calculo += notaMetodos(partes.some((p) => p.desdeAlta));
  if (!unica && devs.some((r) => r.length > 1)) {
    calculo += ' Cada cuenta se aplica igual a las dos pagas.';
  }
  for (const paga of new Set(partes.filter((p) => p.cobrada).map((p) => p.paga))) {
    calculo += NOTA_COBRADA[paga];
  }
  if (unica) {
    calculo +=
      ' Con una sola paga extra no se sabe cuál es (verano o Navidad), por lo que se muestra el rango entre ambas.';
  }
  if (e.numeroPagas > 2) {
    calculo +=
      ' Solo se calculan las dos pagas habituales (verano y Navidad); las demás dependen del convenio.';
  }
  return {
    id: 'pagas_extra',
    titulo: 'Pagas extra devengadas',
    sentido: 'abono',
    rango,
    calculo,
    dependeDeConvenio: true,
    segunTuDato: e.devengoPagas !== 'no_lo_se',
    fuentes: [FUENTES.et31],
  };
}

export function partidaPreavisoEmpresa(e: EntradaFiniquito): Partida | null {
  const objetivo = e.causa === 'objetivo';
  const temporalLargo = e.causa === 'fin_temporal' && diasNaturales(e.fechaAlta, e.fechaBaja) > 365;
  if (!objetivo && !temporalLargo) return null;
  const recibidos = e.diasPreavisoRecibidos ?? 0;
  const faltan = Math.max(0, DIAS_PREAVISO - recibidos);
  const diaMin = e.salarioMensual / 30;
  const diaMax = salarioAnual(e) / 365;
  return {
    id: 'preaviso_empresa',
    titulo: 'Preaviso no dado por la empresa',
    sentido: 'abono',
    rango: entre(faltan * diaMin, faltan * diaMax),
    calculo: `${DIAS_PREAVISO} días de preaviso − ${recibidos} recibidos = ${faltan} días × entre ${eur(diaMin)} y ${eur(diaMax)} al día.`,
    dependeDeConvenio: false,
    segunTuDato: false,
    fuentes: [objetivo ? FUENTES.et53 : FUENTES.et49],
  };
}

export function partidaDescuentoPreaviso(e: EntradaFiniquito): Partida | null {
  if (e.causa !== 'dimision') return null;
  const base = {
    id: 'descuento_preaviso',
    titulo: 'Descuento por preaviso no cumplido',
    sentido: 'descuento',
    fuentes: [FUENTES.et49],
  } as const;
  if (e.diasPreavisoConvenio === undefined) {
    return {
      ...base,
      rango: null,
      calculo:
        'El plazo de preaviso de una dimisión lo fija el convenio; sin ese dato no se puede comprobar el descuento.',
      dependeDeConvenio: true,
      segunTuDato: false,
    };
  }
  const dados = e.diasPreavisoDados ?? 0;
  const faltan = Math.max(0, e.diasPreavisoConvenio - dados);
  const diario = Math.max(e.salarioMensual / 30, salarioAnual(e) / 365);
  return {
    ...base,
    rango: entre(0, faltan * diario),
    calculo: `${e.diasPreavisoConvenio} días de preaviso del convenio − ${dados} dados = ${faltan} días × ${eur(diario)} al día como máximo.`,
    dependeDeConvenio: false,
    segunTuDato: true,
  };
}
