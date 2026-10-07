import type { CivilDate } from '../date';
import { round2 } from '../money';
import { anniversaryIn } from './anniversary';
import { rentalPhrase as p, type RentalPhrase } from './calculation';
import {
  itemReading,
  itemResult,
  notEntered,
  readAcross,
  single,
  type ItemReading,
  type ItemResult,
} from './item';
import { uniqueById, type Doubt, type Outcome } from './outcome';
import { allowedRise, type AllowedRise } from './rent-update';
import { ruleFrame } from './rule-worlds';
import type { RuleId } from './rules';
import type { Charge, RentalDeps, RentalInput } from './types';

// Below a cent the difference is rounding.
const TOLERANCE = 0.01;
// LAU art. 20.2: the increase is capped during the first five years, or seven with a company
// landlord. The rise on the fifth (seventh) anniversary opens the year after them, so it is not.
const CAPPED_YEARS = { person: 5, company: 7 } as const;
// Each open doubt doubles the readings of a year; past this many, the year is not worked out.
const MAX_DOUBTS = 10;

const sumCharged = (c: Charge): number => round2(c.charged.reduce((s, x) => s + x.amount, 0));

// What was charged each calendar year, in year order, however many receipts it came in.
function chargedByYear(c: Charge): readonly { readonly year: number; readonly amount: number }[] {
  const years = new Map<number, number>();
  for (const { year, amount } of c.charged) years.set(year, (years.get(year) ?? 0) + amount);
  return [...years]
    .sort(([a], [b]) => a - b)
    .map(([year, amount]) => ({ year, amount: round2(amount) }));
}

// LAU art. 20.1: a charge on the tenant needs a written agreement that fixes its yearly amount.
// A charge missing from the contract may rest on a later agreement this review does not see.
function unagreed(c: Charge): ItemReading | null {
  if (!c.inContract)
    return itemReading(
      'review_it',
      null,
      [p('charges.not_in_contract', { charged: { euros: sumCharged(c) } })],
      ['charges_pact'],
    );
  if (c.annualAgreed === null)
    return itemReading('review_it', null, [p('charges.no_annual_amount')], ['charges_pact']);
  return null;
}

function compare(
  charged: number,
  cap: number,
  phrases: readonly RentalPhrase[],
  rules: readonly RuleId[],
  upperBoundOnly: boolean,
): ItemReading {
  const over = round2(charged - cap);
  const vars = { charged: { euros: charged }, cap: { euros: cap } };
  if (over > TOLERANCE)
    return itemReading(
      'paid_over',
      over,
      [...phrases, p('charges.over_cap', { ...vars, amount: { euros: over } })],
      rules,
    );
  // Under a bound worked out from an unknown clause, nothing below it can be told apart.
  if (upperBoundOnly)
    return itemReading('not_checkable', null, [...phrases, p('charges.rise_upper_bound')], rules);
  return itemReading('within_limit', null, [...phrases, p('charges.within_cap', vars)], rules);
}

// LAU art. 20.2: each year the charge may rise at most twice what the rent may rise that year
// under art. 18.1, compounding from the yearly amount agreed in the contract. The limit is tied to
// the rent's possible rise, so with no update clause (no rise under art. 18.1) the charge cannot
// rise at all. Whether the extraordinary caps count as that rise is read both ways.
function cappedYear(
  agreed: number,
  year: number,
  charged: number,
  rises: readonly { readonly year: number; readonly rise: AllowedRise }[],
): Outcome<ItemReading> {
  const upTo = rises.filter((r) => r.year <= year);
  const doubts: Doubt[] = [...uniqueById(upTo.flatMap((r) => r.rise.doubts))];
  const base: RuleId[] = ['charges_pact', 'charges_increase'];
  if (doubts.length > MAX_DOUBTS)
    return single(itemReading('not_checkable', null, [p('charges.too_many_readings')], base));
  return readAcross(doubts, (world) => {
    let cap = agreed;
    let upperBoundOnly = false;
    const phrases: RentalPhrase[] = [p('charges.agreed', { amount: { euros: agreed } })];
    const rules: RuleId[] = [...base];
    for (const r of upTo) {
      const rate = r.rise.rateIn(world);
      rules.push(...rate.rules);
      if (!rate.ok)
        return itemReading(
          'not_checkable',
          null,
          [...phrases, p('charges.rise_not_checkable', { year: { integer: r.year } })],
          [...new Set(rules)],
        );
      upperBoundOnly ||= rate.upperBoundOnly;
      const previous = cap;
      cap = round2(cap * (1 + (2 * rate.rate) / 100));
      phrases.push(
        p('charges.year_cap', {
          year: { integer: r.year },
          previous: { euros: previous },
          rise: { percent: rate.rate },
          cap: { euros: cap },
        }),
      );
    }
    return compare(charged, cap, phrases, [...new Set(rules)], upperBoundOnly);
  });
}

function chargeItems(
  input: RentalInput,
  c: Charge,
  index: number,
  deps: RentalDeps,
  rises: (until: number) => readonly { readonly year: number; readonly rise: AllowedRise }[],
): readonly ItemResult[] {
  const item = (outcome: Outcome<ItemReading>, year?: number) =>
    itemResult('charge', year === undefined ? { index } : { index, year }, outcome, deps.norms);
  const tax = c.kind === 'property_tax' || c.kind === 'waste';
  const missing = unagreed(c);
  // Taxes are left out of the cap (art. 20.2). A waste fee is a tax in most towns but not all, so
  // it is not capped either.
  const informative =
    missing ??
    itemReading(
      'not_checkable',
      null,
      [p(c.kind === 'waste' ? 'charges.waste_may_be_tax' : 'charges.tax_outside_cap')],
      ['charges_increase'],
    );
  if (c.kind === 'property_tax') {
    // LAU art. 20.1 as reworded by RDL 29/2026: no tax tied to the home on the tenant unless the
    // tenant is the taxpayer. Read only for contracts signed from then on.
    const ban = ruleFrame(input.signedOn, ['taxes_ban'], deps.norms);
    if (c.charged.length === 0) return [item(single(informative))];
    return chargedByYear(c).map(({ year, amount }) =>
      item(
        readAcross(ban.doubts, (world) =>
          ban.holds('taxes_ban', world)
            ? itemReading(
                'paid_over',
                amount,
                [p('charges.tax_banned', { charged: { euros: amount } })],
                ['taxes_ban'],
              )
            : informative,
        ),
        year,
      ),
    );
  }
  if (tax || missing !== null) return [item(single(informative))];
  // A charge of another kind may be a supply read by meter (art. 20.3, the tenant's) or a tax, both
  // outside the cap: left to look at, with no figure.
  if (c.kind === 'other')
    return [
      item(single(itemReading('review_it', null, [p('charges.other_kind')], ['charges_meters']))),
    ];
  const agreed = c.annualAgreed ?? 0;
  if (c.charged.length === 0) return [item(single(notEntered(['charges_pact'])))];
  const start = input.startDate;
  const capped = CAPPED_YEARS[input.landlordType];
  return chargedByYear(c).map(({ year, amount }) => {
    if (year - start.y >= capped)
      return item(
        single(
          itemReading(
            'not_applicable_to_date',
            null,
            [p('charges.past_first_years', { years: { integer: capped } })],
            ['charges_increase'],
          ),
        ),
        year,
      );
    return item(cappedYear(agreed, year, amount, rises(year)), year);
  });
}

// Service charges passed on to the tenant (LAU art. 20), each year charged against the agreed
// yearly amount and the rise the rent allows. Meter-read supplies are the tenant's (art. 20.3)
// and are not items.
export function checkCharges(input: RentalInput, deps: RentalDeps): readonly ItemResult[] {
  const start = input.startDate;
  const cache = new Map<number, AllowedRise>();
  const riseIn = (year: number): AllowedRise => {
    const found = cache.get(year);
    if (found) return found;
    const day: CivilDate = anniversaryIn(start, year);
    const rise = allowedRise(input, day, deps);
    cache.set(year, rise);
    return rise;
  };
  const rises = (until: number) =>
    Array.from({ length: Math.max(0, until - start.y) }, (_, k) => {
      const year = start.y + k + 1;
      return { year, rise: riseIn(year) };
    });
  return input.charges.flatMap((c, index) => chargeItems(input, c, index, deps, rises));
}
