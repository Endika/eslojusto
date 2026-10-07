import { addMonthsClamped, max, toIso, type CivilDate } from '../date';
import { anniversaryIn } from './anniversary';
import type { NormTable } from './norms';
import { ruleFrame } from './rule-worlds';
import { RULES, ruleSource, type RentalSource, type RuleId } from './rules';
import type { RegionCode, RentalInput } from './types';

// Blocks that inform with dates and sources, never with an amount: what the review does not
// work out but the person should know is there.
export type InformationId =
  | 'stressed_zone'
  | 'reference_price'
  | 'minimum_term'
  | 'notice_windows'
  | 'extensions_rdl28'
  | 'extension_rdl29'
  | 'deposit_lodging'
  | 'regional_rules'
  | 'meters'
  | 'guarantee_return'
  | 'closing_document';

export interface InformationBlock {
  readonly id: InformationId;
  // ISO days the block names.
  readonly dates: Readonly<Record<string, string>>;
  // The answer to «¿está en zona tensionada?» that opened the block.
  readonly answer: 'yes' | 'unknown' | null;
  readonly region: RegionCode | null;
  // Official pages to look the point up.
  readonly links: readonly string[];
  readonly sources: readonly RentalSource[];
}

// Servicio estatal de referencia del precio del alquiler de vivienda (MIVAU).
const SERPAVI = 'https://www.mivau.gob.es/vivienda/alquila-bien-es-tu-derecho/serpavi';
// LAU art. 9.1: the term runs to five years, or seven with a company landlord.
const MINIMUM_YEARS = { person: 5, company: 7 } as const;
// LAU art. 10.1: notice before the end, four months from the landlord and two from the tenant;
// without it, the contract goes on a year at a time up to three more.
const LANDLORD_NOTICE_MONTHS = 4;
const TENANT_NOTICE_MONTHS = 2;
const TACIT_YEARS = 3;
// RDL 29/2026, DF 5.ª: contracts whose mandatory or tacit term ends by this day.
const RDL29_EXTENSION_UNTIL = '2028-12-31';

const block = (
  id: InformationId,
  sources: readonly RentalSource[],
  extra: Partial<Omit<InformationBlock, 'id' | 'sources'>> = {},
): InformationBlock => ({
  id,
  dates: {},
  answer: null,
  region: null,
  links: [],
  sources,
  ...extra,
});

function termEnds(input: RentalInput): {
  readonly contract: CivilDate;
  readonly mandatory: CivilDate;
} {
  const start = input.startDate;
  const contract = addMonthsClamped(start, input.agreedMonths);
  const years = MINIMUM_YEARS[input.landlordType];
  return { contract, mandatory: max(contract, anniversaryIn(start, start.y + years)) };
}

const inWindow = (day: string, rule: RuleId, until: string | null): boolean =>
  day >= RULES[rule].from && (until === null || day <= until);

export function informationBlocks(
  input: RentalInput,
  norms: NormTable,
): readonly InformationBlock[] {
  const source = (id: RuleId) => ruleSource(id, norms);
  const blocks: InformationBlock[] = [];
  const start = input.startDate;
  const signed = ruleFrame(input.signedOn, ['stressed_zone'], norms);

  // LAU art. 17.6 and 17.7: in a stressed zone the initial rent may be capped; checked in SERPAVI.
  if (input.stressedZone !== false && signed.active.has('stressed_zone'))
    blocks.push(
      block('stressed_zone', [source('stressed_zone')], {
        answer: input.stressedZone === true ? 'yes' : 'unknown',
        links: [SERPAVI],
      }),
    );

  // RDL 29/2026, DF 6.ª a): no rise while the rent is above the reference price; SERPAVI again.
  const capRule = RULES.cap_2_rdl29;
  const keysBack = input.moveOut === null ? null : toIso(input.moveOut.keysReturnedOn);
  const capYears = Array.from(
    {
      length:
        Number((capRule.until ?? capRule.from).slice(0, 4)) - Number(capRule.from.slice(0, 4)) + 1,
    },
    (_, k) => Number(capRule.from.slice(0, 4)) + k,
  );
  const anniversaries = capYears
    .map((y) => anniversaryIn(start, y))
    .filter((d) => d.y > start.y && (keysBack === null || toIso(d) < keysBack));
  if (
    anniversaries.some(
      (d) =>
        inWindow(toIso(d), 'cap_2_rdl29', capRule.until) &&
        ruleFrame(d, ['cap_2_rdl29'], norms).active.has('cap_2_rdl29'),
    )
  )
    blocks.push(block('reference_price', [source('cap_2_rdl29')], { links: [SERPAVI] }));

  const ends = termEnds(input);
  blocks.push(
    block('minimum_term', [source('term_minimum')], {
      dates: { contractEnd: toIso(ends.contract), mandatoryEnd: toIso(ends.mandatory) },
    }),
  );
  const term = ruleFrame(ends.mandatory, ['term_tacit', 'term_rdl28'], norms);
  const tacitEnd = anniversaryIn(ends.mandatory, ends.mandatory.y + TACIT_YEARS);
  if (term.active.has('term_tacit'))
    blocks.push(
      block('notice_windows', [source('term_tacit')], {
        dates: {
          landlordBy: toIso(addMonthsClamped(ends.mandatory, -LANDLORD_NOTICE_MONTHS)),
          tenantBy: toIso(addMonthsClamped(ends.mandatory, -TENANT_NOTICE_MONTHS)),
          tacitUntil: toIso(tacitEnd),
        },
      }),
    );
  // RDL 28/2026 rewrites art. 10 from 15-11-2026; shown with its status while it is pending.
  if (term.active.has('term_rdl28'))
    blocks.push(
      block('extensions_rdl28', [source('term_rdl28')], {
        dates: { mandatoryEnd: toIso(ends.mandatory) },
      }),
    );
  const extensionRule = RULES.extension_rdl29;
  const endsInExtension = [ends.mandatory, tacitEnd].some(
    (d) =>
      inWindow(toIso(d), 'extension_rdl29', RDL29_EXTENSION_UNTIL) &&
      ruleFrame(d, ['extension_rdl29'], norms).active.has('extension_rdl29'),
  );
  if (endsInExtension)
    blocks.push(
      block('extension_rdl29', [source('extension_rdl29')], {
        dates: { from: extensionRule.from, until: RDL29_EXTENSION_UNTIL },
      }),
    );

  blocks.push(
    block('deposit_lodging', [source('deposit_lodging')]),
    block('regional_rules', [], { region: input.region, links: [norms.lau.url] }),
    block('meters', [source('charges_meters')]),
  );

  if (input.moveOut !== null) {
    if (input.guarantees.some((g) => g.kind === 'cash' && g.amount !== null))
      blocks.push(block('guarantee_return', [source('deposit_interest')]));
    // LAU art. 36.7, added by RDL 29/2026: without a signed closing document, the home is presumed
    // handed back in good order.
    const closing = ruleFrame(input.moveOut.keysReturnedOn, ['closing_document'], norms);
    if (closing.active.has('closing_document'))
      blocks.push(block('closing_document', [source('closing_document')]));
  }
  return blocks;
}
