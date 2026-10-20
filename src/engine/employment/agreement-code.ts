// What a collective agreement's code says about its scope (RD 713/2010, anexo 3): digits 1-2 are
// the labour authority that registered it, digit 8 its functional scope. Only the 14-digit codes
// in use since 2010 carry this; an older or partial code says nothing.

export type AgreementAuthority = 'state' | 'regional' | 'province' | 'unknown';
export type AgreementLevel = 'sector' | 'company' | 'unknown';

export interface AgreementScope {
  readonly authority: AgreementAuthority;
  readonly level: AgreementLevel;
}

const UNKNOWN: AgreementScope = { authority: 'unknown', level: 'unknown' };

// 01-52 are the provinces, Ceuta and Melilla; a one-province community (Madrid, Asturias,
// Cantabria, Murcia, Navarra, La Rioja, Baleares) registers under its province's code, so «province»
// also covers its regional agreements. 71-86 are the other communities, 90 and 99 the State
// (company and sector).
function authorityOf(digits: number): AgreementAuthority {
  if (digits >= 1 && digits <= 52) return 'province';
  if (digits >= 71 && digits <= 86) return 'regional';
  if (digits === 90 || digits === 99) return 'state';
  return 'unknown';
}

// 1-3: one or more workplaces, a company, a group of companies; 4-5: a sector below or at least
// the size of a province; 0 («franja», a group of workers) is neither.
function levelOf(digit: number): AgreementLevel {
  if (digit >= 1 && digit <= 3) return 'company';
  if (digit === 4 || digit === 5) return 'sector';
  return 'unknown';
}

export function agreementScope(code: string | null): AgreementScope {
  if (code === null || !/^[0-9]{14}$/.test(code)) return UNKNOWN;
  return {
    authority: authorityOf(Number(code.slice(0, 2))),
    level: levelOf(Number(code[7])),
  };
}
