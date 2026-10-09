import { ordinal, parseDate } from '../date';
import type { Norm } from './norms';
import type { RuleBase } from './rules';
import type { LawSource } from './sources';

export type AmountRuleBreach =
  | { readonly rule: string; readonly reason: 'unverified_source'; readonly source: string }
  | { readonly rule: string; readonly reason: 'unknown_source'; readonly source: string }
  | { readonly rule: string; readonly reason: 'draft_norm'; readonly norm: string }
  | { readonly rule: string; readonly reason: 'unknown_norm'; readonly norm: string };

// An amount may rest only on verified sources and on norms that are not drafts: a doubtful point
// comes out as information or as two readings, never as a figure.
export function amountRuleBreaches(
  rules: Readonly<Record<string, RuleBase>>,
  sources: Readonly<Record<string, LawSource>>,
  norms: Readonly<Record<string, Norm<string>>>,
): readonly AmountRuleBreach[] {
  const breaches: AmountRuleBreach[] = [];
  for (const rule of Object.values(rules)) {
    if (rule.output !== 'amount') continue;
    if (rule.norm !== null) {
      const norm = norms[rule.norm];
      if (norm === undefined)
        breaches.push({ rule: rule.id, reason: 'unknown_norm', norm: rule.norm });
      else if (norm.status === 'draft')
        breaches.push({ rule: rule.id, reason: 'draft_norm', norm: rule.norm });
    }
    for (const id of rule.sources) {
      const source = sources[id];
      if (source === undefined)
        breaches.push({ rule: rule.id, reason: 'unknown_source', source: id });
      else if (!source.verified)
        breaches.push({ rule: rule.id, reason: 'unverified_source', source: id });
    }
  }
  return breaches;
}

// Case law moves without a BOE to watch: each criterion is reread at least this often.
export const CASE_LAW_REVIEW_DAYS = 180;

// The case-law sources last read more than `CASE_LAW_REVIEW_DAYS` before `today` (ISO day).
export function staleCaseLaw(
  sources: Readonly<Record<string, LawSource>>,
  today: string,
): readonly LawSource[] {
  const day = ordinal(parseDate(today));
  return Object.values(sources).filter(
    (s) =>
      s.basis === 'case_law' && day - ordinal(parseDate(s.lastVerified)) > CASE_LAW_REVIEW_DAYS,
  );
}
