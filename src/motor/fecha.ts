export interface Fecha {
  readonly y: number;
  readonly m: number;
  readonly d: number;
}

export function diasDelAnio(y: number): 365 | 366 {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

export function diasDelMes(y: number, m: number): number {
  return (
    [31, diasDelAnio(y) === 366 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] ?? NaN
  );
}

export function parseFecha(iso: string): Fecha {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Fecha no válida: ${iso}`);
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (m < 1 || m > 12 || d < 1 || d > diasDelMes(y, m))
    throw new RangeError(`Fecha no válida: ${iso}`);
  return { y, m, d };
}

export function aIso(f: Fecha): string {
  return `${String(f.y).padStart(4, '0')}-${String(f.m).padStart(2, '0')}-${String(f.d).padStart(2, '0')}`;
}

// Howard Hinnant, days_from_civil.
export function ordinal({ y, m, d }: Fecha): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

export function desdeOrdinal(n: number): Fecha {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

export const comparar = (a: Fecha, b: Fecha): number => ordinal(a) - ordinal(b);
export const sumarDias = (f: Fecha, n: number): Fecha => desdeOrdinal(ordinal(f) + n);
export const max = (a: Fecha, b: Fecha): Fecha => (comparar(a, b) >= 0 ? a : b);
export const min = (a: Fecha, b: Fecha): Fecha => (comparar(a, b) <= 0 ? a : b);

export function sumarMesesRecortando(f: Fecha, n: number): Fecha {
  const total = f.y * 12 + (f.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return { y, m, d: Math.min(f.d, diasDelMes(y, m)) };
}

export function diasNaturales(desde: Fecha, hasta: Fecha): number {
  return ordinal(hasta) - ordinal(desde) + 1;
}

export function mesesCompletosYResto(
  desde: Fecha,
  hasta: Fecha,
): { completos: number; resto: number } {
  let completos = (hasta.y - desde.y) * 12 + (hasta.m - desde.m) + 1;
  const finDeCompletos = (k: number) => sumarDias(sumarMesesRecortando(desde, k), -1);
  while (completos > 0 && comparar(finDeCompletos(completos), hasta) > 0) completos--;
  return { completos, resto: Math.max(0, ordinal(hasta) - ordinal(finDeCompletos(completos))) };
}

// Guía CGPJ §4.a: «prorrateándose por meses»; cualquier fracción de mes cuenta como mes entero.
export function mesesProrrateados(desde: Fecha, hasta: Fecha): number {
  const { completos, resto } = mesesCompletosYResto(desde, hasta);
  return resto > 0 ? completos + 1 : completos;
}

// Month-based accrual used by payroll software: each whole calendar month counts 1, a partial one days/30.
export function mesesDevengo(desde: Fecha, hasta: Fecha): number {
  let total = 0;
  let inicio = desde;
  while (comparar(inicio, hasta) <= 0) {
    const finMes: Fecha = { y: inicio.y, m: inicio.m, d: diasDelMes(inicio.y, inicio.m) };
    const fin = min(finMes, hasta);
    const completo = inicio.d === 1 && fin.d === finMes.d;
    total += completo ? 1 : Math.min(1, diasNaturales(inicio, fin) / 30);
    inicio = sumarDias(finMes, 1);
  }
  return total;
}

// Month-based accrual counted from the alta date: whole months by monthly anniversary, plus leftover days / 30.
export function mesesAniversario(desde: Fecha, hasta: Fecha): number {
  const { completos, resto } = mesesCompletosYResto(desde, hasta);
  return completos + resto / 30;
}
