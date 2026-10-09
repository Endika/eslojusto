import { isReadable, type Reading, type Section } from './extraction';
import type { InsuranceMerged } from './insurance-merge';

// Whether what the documents state hangs together; never whether a date was met or a premium is
// fair, which is the site's engine's to say.
export type InsuranceCheck =
  'expiry_before_effect' | 'notice_after_expiry' | 'premium_parts_do_not_sum';

const cents = (n: number): number => Math.round(n * 100);
const PREMIUM_TOLERANCE_CENTS = 5;

function value(s: Section | undefined, name: string): unknown {
  return s?.fields[name]?.value;
}

const num = (s: Section | undefined, name: string): number | null => {
  const v = value(s, name);
  return typeof v === 'number' ? v : null;
};

const str = (s: Section | undefined, name: string): string | null => {
  const v = value(s, name);
  return typeof v === 'string' ? v : null;
};

function premiumPartsDoNotSum(policy: Section | undefined): boolean {
  const total = num(policy, 'premiumTotal');
  const net = num(policy, 'premiumNet');
  if (total === null || net === null) return false;
  const parts =
    cents(net) +
    cents(num(policy, 'premiumSurcharges') ?? 0) +
    cents(num(policy, 'premiumTaxes') ?? 0);
  return Math.abs(parts - cents(total)) > PREMIUM_TOLERANCE_CENTS;
}

export function insuranceFailedChecks(r: Reading): readonly InsuranceCheck[] {
  const failed: InsuranceCheck[] = [];
  const { insurance_policy: policy, insurance_renewal_notice: notice } = r.sections;
  // ISO dates compare correctly as strings.
  const [effective, expires] = [str(policy, 'effectiveOn'), str(policy, 'expiresOn')];
  if (effective !== null && expires !== null && expires < effective)
    failed.push('expiry_before_effect');
  const [sent, ends] = [str(notice, 'noticeOn'), str(notice, 'expiresOn')];
  if (sent !== null && ends !== null && sent > ends) failed.push('notice_after_expiry');
  if (premiumPartsDoNotSum(policy)) failed.push('premium_parts_do_not_sum');
  return failed;
}

// A legible policy or notice that yields no end date has missed what every date hangs on.
export function insuranceIncomplete(reading: Reading, extraction: InsuranceMerged): boolean {
  const read = reading.pages.some(
    (p) =>
      (p.kind === 'insurance_policy' || p.kind === 'insurance_renewal_notice') && isReadable(p),
  );
  return read && extraction.fields.expiresOn === undefined;
}
