import type { CompletedReview } from '../../src/calculator/ports';
import { reviewFinalPay, type EmployerFigures } from '../../src/engine/review';
import type { FinalPayInput } from '../../src/engine/types';
import { estimateBenefit } from '../../src/engine/unemployment';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import type { KeyValueStore } from '../../src/documents/ports';

export const today = { y: 2026, m: 10, d: 7 };
export const tr: Translate = (key, vars) => t('es', key, vars);

export const unfairDismissal: FinalPayInput = {
  cause: 'unfair_dismissal',
  startDate: { y: 2010, m: 3, d: 1 },
  endDate: { y: 2026, m: 9, d: 15 },
  monthlySalary: 2142.86,
  extraPayProrated: true,
  extraPayCount: 2,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};

export function completed(
  input: FinalPayInput = unfairDismissal,
  figures: EmployerFigures = { severance: 40000, holiday_pay: 1500 },
): CompletedReview {
  const r = reviewFinalPay(input, figures, today);
  if (!r.ok) throw new Error('invalid input');
  return {
    review: r.review,
    input,
    figures,
    benefit: estimateBenefit(input, 0, { contracts: [], benefitDrawnSince: null }),
    otherContracts: 0,
  };
}

const b64url = (v: object) =>
  btoa(JSON.stringify(v)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
// A pass shaped like the API's; its signature means nothing to the page.
export const passToken = (claims: object) => `v1.${b64url(claims)}.c2lnbmF0dXJl`;

export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: (k) => data.get(k) ?? null,
    set: (k, v) => void data.set(k, v),
    remove: (k) => void data.delete(k),
  };
}
