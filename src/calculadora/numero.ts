const CON_COMA = /^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;
const MILES_CON_PUNTO = /^\d{1,3}(\.\d{3})+$/;
const DECIMAL_CON_PUNTO = /^\d+(\.\d+)?$/;

export function parseImporte(texto: string): number | null {
  const t = texto.replace(/[\s\u00a0\u202f€]/g, '');
  if (t === '') return null;
  if (t.includes(',')) {
    return CON_COMA.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : NaN;
  }
  if (MILES_CON_PUNTO.test(t)) return Number(t.replace(/\./g, ''));
  return DECIMAL_CON_PUNTO.test(t) ? Number(t) : NaN;
}

const EUROS = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
});

export function formatoEuros(n: number): string {
  return EUROS.format(n);
}

const EUROS_ENTEROS = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  maximumFractionDigits: 0,
});

// An estimate reads in whole euros: «unos 1.225 €».
export function formatoEurosEnteros(n: number): string {
  return EUROS_ENTEROS.format(Math.round(n));
}

const ENTERO = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

export function formatoEntero(n: number): string {
  return ENTERO.format(n);
}
