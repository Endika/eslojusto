import { toIso, type CivilDate } from '../engine/date';
import type { InformationMoment } from '../engine/employment/information-duty';
import { compareByYear, type YearComparison } from '../engine/employment/minimum-wage';
import { LAW_QUOTES } from '../engine/employment/quotes';
import type { EmploymentDeps, EmploymentReview } from '../engine/employment/review';
import { isFixedTerm } from '../engine/employment/term';
import { ruleSource } from '../engine/employment/rules';
import type {
  Assessed,
  EmploymentInput,
  Finding,
  FindingId,
  FindingStatus,
  InfoElement,
} from '../engine/employment/types';
import { formatEuros } from '../calculator/number';
import { longDate, type LetterDetails, type LetterKind } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { ClientKey, Translate } from '../i18n/client';
import type { CompletedEmploymentReview } from './ports';
import { dayText, findingsOf } from './render';

// What a letter may say: only what holds in every reading of the review, never a doubt, a limit
// the agreement may move or a year whose minimum wage is not published yet.

const CONCRETE: ReadonlySet<FindingStatus> = new Set([
  'below_minimum',
  'over_legal_limit',
  'clause_void',
  'becomes_permanent',
]);
const isConcrete = (f: Finding): boolean => CONCRETE.has(f.status) && !f.agreementMaySetOther;

// The contract's pay year by year against the minimum wage; the payslips are compared apart.
const CONTRACT_PAY: ReadonlySet<FindingId> = new Set([
  'smi_annual',
  'smi_prorata',
  'smi_temporary_120',
]);

// The elements of art. 3.2 RD 723/2026 the contract lacks and the law requires, the agreement and
// the category first, as the engine lists them.
export interface MissingInformation {
  readonly moment: InformationMoment;
  readonly elements: readonly InfoElement[];
}

export function missingInformation(review: EmploymentReview): MissingInformation | null {
  const duty = review.informationDuty;
  if (duty?.applies !== true) return null;
  const elements = duty.elements.flatMap((e) =>
    e.applies && e.finding.status === 'missing_requirement' ? [e.element] : [],
  );
  return elements.length === 0 ? null : { moment: duty.moment, elements };
}

// The years the contract's pay is certainly below the minimum wage, with the figures most
// favourable to the pay: only a shortfall found without any «No lo sé», and only in a year whose
// minimum is published.
export interface PayShortfall {
  readonly finding: Finding;
  readonly years: readonly Extract<YearComparison, { kind: 'compared' }>[];
}

export function payShortfall(
  r: CompletedEmploymentReview,
  today: CivilDate,
  tables: EmploymentDeps,
): PayShortfall | null {
  const assessed = r.review.items.find((a) => findingsOf(a).some((f) => CONTRACT_PAY.has(f.id)));
  if (assessed?.kind !== 'single' || assessed.finding.status !== 'below_minimum') return null;
  const years = compareByYear(r.input, today, tables.minimumWage).flatMap((y) =>
    y.kind === 'compared' && y.verdict === 'below' ? [y] : [],
  );
  return years.length === 0 ? null : { finding: assessed.finding, years };
}

// Every other point that does not match the law in every reading, each to be named with its norm.
export function pointsToReview(review: EmploymentReview): readonly Finding[] {
  const assessed: readonly Assessed[] = [
    ...review.items,
    ...review.clauses.flatMap((c) => (c.assessed === null ? [] : [c.assessed])),
  ];
  return assessed.flatMap((a) =>
    a.kind === 'single' && isConcrete(a.finding) && !CONTRACT_PAY.has(a.finding.id)
      ? [a.finding]
      : [],
  );
}

// The limits and requirements art. 15 ET sets on fixed-term contracts: the cause, the duration,
// the extensions, the replacement, the abolished modalities and the chaining. Training contracts,
// fixed-discontinuous ones and the written form of an open-ended contract are other rules.
const FIXED_TERM_RULES: ReadonlySet<FindingId> = new Set([
  'fixed_term_presumption',
  'production_6_months',
  'production_1_year',
  'production_one_extension',
  'production_occasional_90',
  'production_occasional_agrifood_120',
  'replacement_name_cause',
  'replacement_selection_3_months',
  'abolished_modalities',
  'permanent_on_breach',
  'chaining_18_in_24',
]);
const TEMPORALITY_STATUSES: ReadonlySet<FindingStatus> = new Set([
  'becomes_permanent',
  'over_legal_limit',
  'missing_requirement',
]);

const isTemporality = (f: Finding, input: EmploymentInput): boolean =>
  !f.agreementMaySetOther &&
  (f.status === 'becomes_permanent' ||
    (TEMPORALITY_STATUSES.has(f.status) &&
      (FIXED_TERM_RULES.has(f.id) || (f.id === 'written_form' && isFixedTerm(input.modality)))));

// A finding about the fixed-term contract that holds in every reading: the only case in which the
// certificate of art. 15.9 ET is offered.
export const hasTemporalityFinding = ({ review, input }: CompletedEmploymentReview): boolean =>
  review.items.some((a) => {
    const findings = findingsOf(a);
    return findings.length > 0 && findings.every((f) => isTemporality(f, input));
  });

export interface EmploymentLetterKinds {
  // The letter to the company with figures or points to review, which the pass pays for.
  readonly paid: readonly LetterKind[];
  // The letters that only ask for information.
  readonly free: readonly LetterKind[];
}

export function employmentLetterKinds(
  r: CompletedEmploymentReview,
  today: CivilDate,
  tables: EmploymentDeps,
): EmploymentLetterKinds {
  const { review } = r;
  return {
    paid:
      payShortfall(r, today, tables) !== null || pointsToReview(review).length > 0
        ? ['employment']
        : [],
    free: [
      ...(missingInformation(review) !== null ? (['information_request'] as const) : []),
      ...(hasTemporalityFinding(r) ? (['temporary_contracts_certificate'] as const) : []),
    ],
  };
}

const day = (d: CivilDate) => dayText(toIso(d));

const blank = (label: string, value = ''): Block => {
  const v = value.trim();
  return v === '' ? { type: 'blank', label } : { type: 'blank', label, value: v, wrap: true };
};

function closing(details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'text', text: tr('client.employment.letter.regards') },
    {
      type: 'text',
      text: tr('client.documents.letter.place_date', {
        lugar: details.place.trim() || tr('client.documents.letter.place_blank'),
        fecha: details.date ? longDate(details.date) : tr('client.documents.letter.date_blank'),
      }),
    },
    blank(tr('client.documents.letter.name'), details.name),
  ];
}

function informationBlocks(
  missing: MissingInformation,
  tables: EmploymentDeps,
  tr: Translate,
): Block[] {
  return [
    {
      type: 'text',
      text: tr(`client.employment.letter.information.${missing.moment}`, {
        norma: tables.norms.rd723_2026.citation,
      }),
    },
    ...missing.elements.map((e): Block => ({
      type: 'bullet',
      text: tr(`client.employment.info.${e}` as ClientKey),
    })),
  ];
}

const YEAR_LINE = {
  year: 'client.employment.letter.pay.year',
  year_prorata: 'client.employment.letter.pay.year_prorata',
  day: 'client.employment.letter.pay.day',
  day_prorata: 'client.employment.letter.pay.day_prorata',
} as const satisfies Record<string, ClientKey>;

// Each year below the minimum: the decree and its full-time amount from the minimum wage table, the
// minimum for the person's working time, the agreed pay and the difference.
function payBlocks(shortfall: PayShortfall, tables: EmploymentDeps, tr: Translate): Block[] {
  const { finding, years } = shortfall;
  const short = finding.id === 'smi_temporary_120';
  return [
    { type: 'text', text: tr('client.employment.letter.pay.intro') },
    ...years.map((y): Block => {
      const full = short ? y.row.temporaryPerDay : y.row.annual;
      const prorated = y.minimum < full;
      const key = YEAR_LINE[`${short ? 'day' : 'year'}${prorated ? '_prorata' : ''}`];
      return {
        type: 'bullet',
        text: tr(key, {
          anio: String(y.year),
          norma: tables.norms[y.row.norm].citation,
          completo: formatEuros(full),
          minimo: formatEuros(y.minimum),
          salario: formatEuros(y.pay),
          diferencia: formatEuros(y.shortfall),
        }),
      };
    }),
    { type: 'text', text: tr('client.employment.letter.pay.ask') },
  ];
}

function pointBlocks(points: readonly Finding[], tr: Translate): Block[] {
  return [
    { type: 'text', text: tr('client.employment.letter.points.intro') },
    ...points.map((f): Block => ({
      type: 'bullet',
      text: tr('client.employment.letter.points.line', {
        punto: tr(`client.employment.finding.${f.id}`),
        norma: f.sources[0]?.citation ?? '',
      }),
    })),
    { type: 'text', text: tr('client.employment.letter.points.ask') },
  ];
}

// The letter to the company: one template whose blocks switch on with the review. `information`
// gives only the request for the information owed in writing, free; `full` adds the pay below the
// minimum wage and the points that do not match the law.
export function companyLetter(
  r: CompletedEmploymentReview,
  scope: 'information' | 'full',
  today: CivilDate,
  tables: EmploymentDeps,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const { review, input } = r;
  const missing = missingInformation(review);
  const shortfall = scope === 'full' ? payShortfall(r, today, tables) : null;
  const points = scope === 'full' ? pointsToReview(review) : [];
  const title = tr(
    scope === 'full'
      ? 'client.employment.letter.company.title'
      : 'client.employment.letter.information.title',
  );
  const id = details.id.trim();
  return {
    title,
    footer: null,
    blocks: [
      { type: 'title', text: title },
      blank(tr('client.documents.letter.name'), details.name),
      // The company knows who writes: the DNI goes only when typed.
      ...(id === '' ? [] : [blank(tr('client.documents.letter.id'), id)]),
      blank(tr('client.documents.letter.company'), details.company),
      blank(tr('client.employment.letter.workplace'), details.workplace),
      {
        type: 'text',
        text: tr('client.employment.letter.company.body', { inicio: day(input.startDate) }),
      },
      ...(missing === null ? [] : informationBlocks(missing, tables, tr)),
      ...(shortfall === null ? [] : payBlocks(shortfall, tables, tr)),
      ...(points.length === 0 ? [] : pointBlocks(points, tr)),
      ...closing(details, tr),
    ],
  };
}

// The request to the public employment service for the certificate of temporary contracts, with
// the words of art. 15.9 ET; never addressed to the company.
export function certificateRequest(
  tables: EmploymentDeps,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.employment.letter.certificate.title');
  const source = ruleSource('temporary_certificate', tables.norms);
  return {
    title,
    footer: null,
    blocks: [
      { type: 'title', text: title },
      { type: 'text', text: tr('client.employment.letter.certificate.to') },
      blank(tr('client.documents.letter.name'), details.name),
      blank(tr('client.documents.letter.id'), details.id),
      blank(tr('client.employment.letter.certificate.company'), details.company),
      {
        type: 'text',
        text: tr('client.employment.letter.certificate.body', { cita: source.citation }),
      },
      { type: 'text', text: `«${LAW_QUOTES.temporary_certificate.text}»` },
      { type: 'source', text: source.citation, url: source.url },
      ...closing(details, tr),
    ],
  };
}
