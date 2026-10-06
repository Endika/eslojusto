import { FUENTES, type Fuente } from './fuentes';
import { dias, entre, exacto, num, redondear, type Rango } from './dinero';
import {
  comparar,
  diasNaturales,
  mesesCompletosYResto,
  min,
  parseFecha,
  type Fecha,
} from './fecha';
import type { Causa, TipoTemporal } from './tipos';

export interface Indemnizacion {
  readonly importe: number;
  readonly rango: Rango;
  readonly diasDeSalario: number;
  readonly salarioDiario: number;
  readonly topeAplicado: boolean;
  readonly detalle: string;
  readonly fuentes: readonly Fuente[];
}

const TOPE_OBJETIVO = 360;
const TOPE_IMPROCEDENTE = 720;
const TOPE_ABSOLUTO = 1260;
const INICIO_DT11 = parseFecha('2012-02-12');
const FIN_TRAMO_1 = parseFecha('2012-02-11');

function resultado(
  salarioDiario: number,
  diasDeSalario: number,
  topeAplicado: boolean,
  detalle: string,
  fuentes: readonly Fuente[],
): Indemnizacion {
  const importe = redondear(salarioDiario * diasDeSalario);
  return {
    importe,
    rango: exacto(importe),
    diasDeSalario,
    salarioDiario,
    topeAplicado,
    detalle,
    fuentes,
  };
}

const NOTA_RANGO =
  ' La calculadora del CGPJ y su guía cuentan distinto los meses en este caso (un mes de diferencia); por eso damos un margen entre ambas cifras.';

type Pick = 'g' | 'lo' | 'hi';
interface MesesRango {
  readonly g: number;
  readonly lo: number;
  readonly hi: number;
}

// La calculadora del CGPJ se desvía un mes de su guía en el borde: con 1-2 días de resto a veces no suma el mes,
// y en un aniversario exacto con inicio distinto del día 1 a veces lo suma.
function mesesRango(desde: Fecha, hasta: Fecha): MesesRango {
  const { completos, resto } = mesesCompletosYResto(desde, hasta);
  const g = resto > 0 ? completos + 1 : completos;
  if (resto === 1 || resto === 2) return { g, lo: completos, hi: g };
  if (resto === 0 && desde.d !== 1) return { g, lo: g, hi: completos + 1 };
  return { g, lo: g, hi: g };
}

interface Calculo {
  readonly dias: number;
  readonly tope: boolean;
  readonly detalle: string;
}

function calculoImprocedente(alta: Fecha, baja: Fecha, sd: number, pick: Pick): Calculo {
  const euroDia = `${num(sd)} €/día`;
  if (comparar(alta, INICIO_DT11) >= 0) {
    const meses = mesesRango(alta, baja)[pick];
    const bruto = meses * 2.75;
    const total = Math.min(bruto, TOPE_IMPROCEDENTE);
    const tope = bruto > TOPE_IMPROCEDENTE;
    const base = `${meses} meses × 2,75 = ${dias(bruto)} días.`;
    const detalle = tope
      ? `${base} Tope de ${TOPE_IMPROCEDENTE} días. Total ${dias(total)} días × ${euroDia}.`
      : `${base} Total ${dias(total)} días × ${euroDia}.`;
    return { dias: total, tope, detalle };
  }
  const meses1 = mesesRango(alta, min(baja, FIN_TRAMO_1))[pick];
  const d1 = meses1 * 3.75;
  const txt1 = `Tramo hasta 11-02-2012: ${meses1} meses × 3,75 = ${dias(d1)} días.`;
  if (d1 > TOPE_IMPROCEDENTE) {
    const total = Math.min(d1, TOPE_ABSOLUTO);
    return {
      dias: total,
      tope: total < d1,
      detalle: `${txt1} Supera ${TOPE_IMPROCEDENTE} días: el tramo posterior no suma y el máximo es ${TOPE_ABSOLUTO} días. Total ${dias(total)} días × ${euroDia}.`,
    };
  }
  let d2 = 0;
  let txt2 = '';
  if (comparar(baja, INICIO_DT11) >= 0) {
    const meses2 = mesesRango(INICIO_DT11, baja)[pick];
    d2 = meses2 * 2.75;
    txt2 = ` Tramo desde 12-02-2012: ${meses2} meses × 2,75 = ${dias(d2)} días.`;
  }
  const bruto = d1 + d2;
  const total = Math.min(bruto, TOPE_IMPROCEDENTE);
  const tope = bruto > TOPE_IMPROCEDENTE;
  const cola = tope
    ? ` Tope de ${TOPE_IMPROCEDENTE} días. Total ${dias(total)} días × ${euroDia}.`
    : ` Total ${dias(total)} días × ${euroDia}.`;
  return { dias: total, tope, detalle: `${txt1}${txt2}${cola}` };
}

function calculoObjetivo(alta: Fecha, baja: Fecha, sd: number, pick: Pick): Calculo {
  const meses = mesesRango(alta, baja)[pick];
  const bruto = (meses * 20) / 12;
  const total = Math.min(bruto, TOPE_OBJETIVO);
  const tope = bruto > TOPE_OBJETIVO;
  const base = `${meses} meses × 20/12 = ${dias(bruto)} días.`;
  const detalle = tope
    ? `${base} Tope de ${TOPE_OBJETIVO} días. Total ${dias(total)} días × ${num(sd)} €/día.`
    : `${base} Total ${dias(total)} días × ${num(sd)} €/día.`;
  return { dias: total, tope, detalle };
}

function conRango(
  alta: Fecha,
  baja: Fecha,
  sd: number,
  calculo: (alta: Fecha, baja: Fecha, sd: number, pick: Pick) => Calculo,
  fuentes: readonly Fuente[],
): Indemnizacion {
  const guia = calculo(alta, baja, sd, 'g');
  const bajo = redondear(sd * calculo(alta, baja, sd, 'lo').dias);
  const alto = redondear(sd * calculo(alta, baja, sd, 'hi').dias);
  const base = resultado(sd, guia.dias, guia.tope, guia.detalle, fuentes);
  const rango = entre(Math.min(bajo, base.importe), Math.max(alto, base.importe));
  const degenerado = rango.minimo === rango.maximo;
  return {
    ...base,
    rango,
    detalle: degenerado ? base.detalle : base.detalle + NOTA_RANGO,
  };
}

function improcedente(alta: Fecha, baja: Fecha, sd: number): Indemnizacion {
  return conRango(alta, baja, sd, calculoImprocedente, [
    FUENTES.et56,
    FUENTES.etDt11,
    FUENTES.guiaCgpj,
  ]);
}

function objetivo(alta: Fecha, baja: Fecha, sd: number): Indemnizacion {
  return conRango(alta, baja, sd, calculoObjetivo, [
    FUENTES.et53,
    FUENTES.guiaCgpj,
    FUENTES.sts651_2026,
  ]);
}

function diasPorAnioTemporal(alta: Fecha): number {
  if (alta.y <= 2011) return 8;
  if (alta.y >= 2015) return 12;
  return alta.y - 2003;
}

function finTemporal(
  alta: Fecha,
  baja: Fecha,
  sd: number,
  tipo: TipoTemporal | undefined,
): Indemnizacion {
  const fuentes = [FUENTES.et49_1c, FUENTES.etDt8, FUENTES.guiaCgpj];
  if (tipo === 'sustitucion' || tipo === 'formativo') {
    return resultado(
      sd,
      0,
      false,
      `Los contratos de ${tipo === 'sustitucion' ? 'sustitución' : 'formación'} no generan indemnización por fin de contrato.`,
      fuentes,
    );
  }
  const n = diasPorAnioTemporal(alta);
  const dn = diasNaturales(alta, baja);
  const diasDeSalario = (dn * n) / 365;
  return resultado(
    sd,
    diasDeSalario,
    false,
    `${new Intl.NumberFormat('es-ES', { useGrouping: 'always' }).format(dn)} días × ${n}/365 × ${num(sd)} €/día`,
    fuentes,
  );
}

export function calcularIndemnizacion(args: {
  causa: Causa;
  fechaAlta: Fecha;
  fechaBaja: Fecha;
  salarioAnual: number;
  tipoTemporal?: TipoTemporal | undefined;
}): Indemnizacion {
  const { causa, fechaAlta, fechaBaja, salarioAnual, tipoTemporal } = args;
  const sd = salarioAnual / 365;
  switch (causa) {
    case 'improcedente':
      return improcedente(fechaAlta, fechaBaja, sd);
    case 'objetivo':
      return objetivo(fechaAlta, fechaBaja, sd);
    case 'fin_temporal':
      return finTemporal(fechaAlta, fechaBaja, sd, tipoTemporal);
    case 'dimision':
      return resultado(sd, 0, false, 'La dimisión voluntaria no genera indemnización.', [
        FUENTES.et49_1d,
        FUENTES.guiaCgpj,
      ]);
    case 'disciplinario':
      return resultado(
        sd,
        0,
        false,
        'El despido disciplinario declarado procedente no genera indemnización. Si se declara improcedente, se calcula como un despido improcedente.',
        [FUENTES.et55, FUENTES.et56, FUENTES.guiaCgpj],
      );
  }
}
