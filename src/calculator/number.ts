const WITH_COMMA = /^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/;
const DOT_THOUSANDS = /^\d{1,3}(\.\d{3})+$/;
const DOT_DECIMAL = /^\d+(\.\d+)?$/;

export function parseAmount(text: string): number | null {
  const t = text.replace(/[\s\u00a0\u202f€]/g, '');
  if (t === '') return null;
  if (t.includes(',')) {
    return WITH_COMMA.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : NaN;
  }
  if (DOT_THOUSANDS.test(t)) return Number(t.replace(/\./g, ''));
  return DOT_DECIMAL.test(t) ? Number(t) : NaN;
}

const EUROS = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
});

export function formatEuros(n: number): string {
  return EUROS.format(n);
}

const WHOLE_EUROS = new Intl.NumberFormat('es-ES', {
  style: 'currency',
  currency: 'EUR',
  useGrouping: 'always',
  maximumFractionDigits: 0,
});

// An estimate reads in whole euros: «unos 1.225 €».
export function formatWholeEuros(n: number): string {
  return WHOLE_EUROS.format(Math.round(n));
}

const INTEGER = new Intl.NumberFormat('es-ES', { useGrouping: 'always' });

export function formatInteger(n: number): string {
  return INTEGER.format(n);
}
