import type { CivilDate } from '../engine/date';
import type { ClauseAssessment } from '../engine/employment/clauses';
import type { InformationDuty } from '../engine/employment/information-duty';
import type { OfferComparison, OfferDifference } from '../engine/employment/offer';
import type { PermanentReference } from '../engine/employment/reference';
import type { Assessed, EmploymentInput, Finding } from '../engine/employment/types';
import type { NormSource } from '../engine/law/sources';
import { formatEuros, formatInteger, formatWholeEuros } from '../calculator/number';
import { longDate } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { ClientKey, Translate } from '../i18n/client';
import type { CompletedEmploymentReview } from './ports';
import {
  calculationLines,
  civilText,
  CLAUSE_LABELS,
  findingsOf,
  inForceText,
  ITEM_LABELS,
  literalOf,
  numberText,
  uniqueSources,
  type Labels,
} from './render';
import { figureOf, headline, sinceOf } from './summary';

const row = (label: string, value: string): Block => ({ type: 'row', label, value });
const day = (d: CivilDate) => civilText(d);

const UNIT = { days: 'day', weeks: 'week', months: 'month' } as const;

const counted = (n: number, unit: keyof typeof UNIT, tr: Translate): string =>
  tr(`client.employment.unit.${UNIT[unit]}_${n === 1 ? 'one' : 'many'}`, { n: numberText(n) });

const noFigure = (tr: Translate) => tr('client.employment.report.no_figure');

// What the person confirmed, as the review read it.
function dataRows(input: EmploymentInput, tr: Translate): Block[] {
  const { salary, contractHours, trial, holidays } = input;
  return [
    row(tr('client.employment.report.start'), day(input.startDate)),
    row(
      tr('client.employment.report.end'),
      input.endDate === null ? tr('client.employment.report.no_end') : day(input.endDate),
    ),
    row(
      tr('client.employment.report.modality'),
      tr(`client.employment.modality.${input.modality}`),
    ),
    row(
      tr('client.employment.report.salary'),
      tr(`client.employment.report.salary_per.${salary.period}`, {
        importe: formatEuros(salary.amount),
      }),
    ),
    row(tr('client.employment.report.payments'), formatInteger(salary.payments)),
    row(
      tr('client.employment.report.weekly_hours'),
      contractHours.weekly === null ? noFigure(tr) : numberText(contractHours.weekly),
    ),
    ...(contractHours.annual === null
      ? []
      : [row(tr('client.employment.report.annual_hours'), numberText(contractHours.annual))]),
    row(
      tr('client.employment.report.full_time'),
      input.fullTimeHours === null ? noFigure(tr) : numberText(input.fullTimeHours),
    ),
    ...(input.agreement.categoryAnnualSalary === null
      ? []
      : [
          row(
            tr('client.employment.report.category_salary'),
            formatEuros(input.agreement.categoryAnnualSalary),
          ),
        ]),
    row(
      tr('client.employment.report.trial'),
      trial === null ? noFigure(tr) : counted(trial.amount, trial.unit, tr),
    ),
    row(
      tr('client.employment.report.holidays'),
      holidays === null
        ? noFigure(tr)
        : tr(`client.employment.report.holidays_${holidays.unit}`, {
            dias: numberText(holidays.days),
          }),
    ),
    row(tr('client.employment.report.payslips'), formatInteger(input.payslips.length)),
    ...(input.history === null
      ? []
      : [row(tr('client.employment.report.history'), formatInteger(input.history.length))]),
  ];
}

// A finding's status with its exact euros: the report says what the summary rounds.
function statusText(f: Finding, tr: Translate): string {
  const figure = figureOf(f);
  return figure === null
    ? tr(`client.employment.status.${f.status}`)
    : tr(`client.employment.status.below_minimum_${figure.per}`, {
        importe: formatEuros(figure.amount),
      });
}

function readingText(f: Finding, tr: Translate): string {
  const figure = figureOf(f);
  return figure === null
    ? tr(`client.employment.reading_status.${f.status}`)
    : tr(`client.employment.reading_status.below_minimum_${figure.per}`, {
        importe: formatEuros(figure.amount),
      });
}

const sourceBlock = (s: NormSource, tr: Translate): Block => ({
  type: 'source',
  text: `${s.citation} · ${inForceText(s, tr)}`,
  url: s.url,
});

// A point's verdict, or each reading of a «No lo sé», then its notes, the law's words, how it is
// worked out in each reading and the norms it rests on.
function assessedBlocks(assessed: Assessed, tr: Translate, labels: Labels): Block[] {
  const findings = findingsOf(assessed);
  const since = assessed.kind === 'single' ? sinceOf(assessed.finding) : null;
  const literal = literalOf(findings, tr);
  const values: readonly { title: string | null; finding: Finding }[] =
    assessed.kind === 'single'
      ? [{ title: null, finding: assessed.finding }]
      : assessed.readings.map((r) => ({ title: labels.reading(r.when, tr), finding: r.finding }));
  return [
    ...(assessed.kind === 'single'
      ? [{ type: 'text', text: statusText(assessed.finding, tr) } as const]
      : [
          { type: 'text', text: tr('client.employment.status.depends') } as const,
          { type: 'text', text: labels.question(assessed.question, tr) } as const,
          ...assessed.readings.map((r): Block => ({
            type: 'bullet',
            text: tr('client.employment.reading_line', {
              cuando: labels.reading(r.when, tr),
              resultado: readingText(r.finding, tr),
            }),
          })),
        ]),
    ...(since === null
      ? []
      : [
          {
            type: 'note',
            text: tr('client.employment.since_year', {
              anio: String(since.from),
              importe: formatEuros(since.amount),
            }),
          } as const,
        ]),
    ...(findings.some((f) => f.basedOnYourAnswer)
      ? [{ type: 'note', text: tr('client.employment.note.your_answer') } as const]
      : []),
    ...(findings.some((f) => f.agreementMaySetOther && f.status !== 'depends_on_agreement')
      ? [{ type: 'note', text: tr('client.employment.note.agreement') } as const]
      : []),
    ...(literal === null
      ? []
      : [
          { type: 'note', text: literal.intro } as const,
          { type: 'text', text: literal.text } as const,
        ]),
    { type: 'note', text: tr('client.employment.report.how') },
    ...values.flatMap(({ title, finding }): Block[] => {
      const lines = calculationLines(finding.calculation, tr);
      return [
        ...(title === null ? [] : [{ type: 'text', text: title } as const]),
        ...(lines.length > 0 ? lines : [tr(`client.employment.status.${finding.status}`)]).map(
          (text): Block => ({ type: 'bullet', text }),
        ),
      ];
    }),
    ...uniqueSources(findings.flatMap((f) => f.sources)).map((s) => sourceBlock(s, tr)),
  ];
}

function itemBlocks(assessed: Assessed, tr: Translate): Block[] {
  const first = findingsOf(assessed)[0];
  if (first === undefined) return [];
  return [
    { type: 'subheading', text: tr(`client.employment.finding.${first.id}`) },
    ...assessedBlocks(assessed, tr, ITEM_LABELS),
  ];
}

function clauseBlocks(clause: ClauseAssessment, input: EmploymentInput, tr: Translate): Block[] {
  const words = input.clauses[clause.index]?.literal.text ?? '';
  return [
    { type: 'subheading', text: tr(`client.employment.clause.${clause.label}`) },
    ...(words === '' ? [] : [{ type: 'text', text: `«${words}»` } as const]),
    ...(clause.assessed === null
      ? [
          {
            type: 'text',
            text: tr(
              clause.checkedIn === null
                ? 'client.employment.clause_not_assessed'
                : 'client.employment.clause_checked_in',
            ),
          } as const,
        ]
      : assessedBlocks(clause.assessed, tr, CLAUSE_LABELS)),
  ];
}

// Every element of art. 3.2 RD 723/2026 with its status and what the review says of it.
function dutyBlocks(duty: InformationDuty, tr: Translate): Block[] {
  const title: Block = { type: 'heading', text: tr('client.employment.duty.title') };
  if (!duty.applies)
    return [
      title,
      { type: 'text', text: tr(`client.employment.duty.${duty.reason}`) },
      ...duty.sources.map((s) => sourceBlock(s, tr)),
    ];
  const checked = duty.elements.flatMap((e) => (e.applies ? [e.finding] : []));
  return [
    title,
    { type: 'text', text: tr(`client.employment.duty.${duty.moment}`) },
    ...duty.elements.flatMap((e): Block[] => [
      {
        type: 'subheading',
        text: tr(`client.employment.info.${e.element}` as ClientKey),
      },
      {
        type: 'text',
        text: e.applies
          ? tr(`client.employment.status.${e.finding.status}`)
          : tr('client.employment.duty.temp_agency_only'),
      },
      ...(e.applies ? calculationLines(e.finding.calculation, tr) : []).map((text): Block => ({
        type: 'bullet',
        text,
      })),
    ]),
    ...uniqueSources(checked.flatMap((f) => f.sources)).map((s) => sourceBlock(s, tr)),
  ];
}

function severanceText(
  key: ClientKey,
  s: PermanentReference['fixedTermEnd'],
  tr: Translate,
): string {
  return s.range.min === s.range.max
    ? tr(key, { importe: formatEuros(s.amount) })
    : tr(`${key}_range` as ClientKey, {
        minimo: formatEuros(s.range.min),
        maximo: formatEuros(s.range.max),
      });
}

// «Si un juzgado lo declarase así»: two reference figures, never part of anything else.
function referenceBlocks(reference: PermanentReference, tr: Translate): Block[] {
  const { fixedTermEnd: end, unfairDismissal: unfair } = reference;
  const sources = [...end.sources, ...unfair.sources].filter(
    (s, i, all) => all.findIndex((o) => o.citation === s.citation) === i,
  );
  return [
    { type: 'heading', text: tr('client.employment.reference.title') },
    {
      type: 'text',
      text: tr('client.employment.reference.lead', { fecha: day(reference.on) }),
    },
    { type: 'bullet', text: severanceText('client.employment.reference.fixed_term_end', end, tr) },
    {
      type: 'bullet',
      text: severanceText('client.employment.reference.unfair_dismissal', unfair, tr),
    },
    ...sources.map((s): Block => ({ type: 'source', text: s.citation, url: s.url })),
  ];
}

const remoteText = (r: string, tr: Translate) => tr(`client.employment.remote.${r}` as ClientKey);

function differenceText(d: OfferDifference, tr: Translate): string {
  const key = `client.employment.offer.difference.${d.field}` as const;
  switch (d.field) {
    case 'gross_annual':
      return tr(key, { oferta: formatWholeEuros(d.offer), contrato: formatWholeEuros(d.contract) });
    case 'weekly_hours':
      return tr(key, { oferta: numberText(d.offer), contrato: numberText(d.contract) });
    case 'modality':
      return tr(key, {
        oferta: tr(`client.employment.modality.${d.offer}`),
        contrato: tr(`client.employment.modality.${d.contract}`),
      });
    case 'remote':
      return tr(key, { oferta: remoteText(d.offer, tr), contrato: remoteText(d.contract, tr) });
  }
}

// The offer beside the contract, without a verdict.
function offerBlocks(offer: OfferComparison, tr: Translate): Block[] {
  const n = offer.differences.length;
  return [
    { type: 'heading', text: tr('client.employment.offer.title') },
    {
      type: 'text',
      text:
        n === 0
          ? tr('client.employment.offer.none')
          : tr(`client.employment.offer.count_${n === 1 ? 'one' : 'many'}`, { n: String(n) }),
    },
    { type: 'note', text: tr('client.employment.offer.no_verdict') },
    ...offer.differences.map((d): Block => ({ type: 'bullet', text: differenceText(d, tr) })),
    ...offer.notCompared.map((c): Block => ({
      type: 'bullet',
      text: tr(`client.employment.offer.not_compared.${c.reason}`, {
        dato: tr(`client.employment.offer.field.${c.field}`),
      }),
    })),
  ];
}

// The whole review, point by point with every reading, its calculation and the norms it rests on,
// as the person confirmed it, dated the day it is made.
export function employmentReport(
  r: CompletedEmploymentReview,
  tr: Translate,
  today: CivilDate,
): DocumentModel {
  const { review, input } = r;
  const { scope } = review;
  return {
    title: tr('client.employment.report.title'),
    footer: tr('client.employment.report.footer', { fecha: longDate(today) }),
    blocks: [
      { type: 'title', text: tr('client.employment.report.title') },
      { type: 'meta', text: tr('client.documents.report.generated', { fecha: longDate(today) }) },
      { type: 'rule' },
      { type: 'text', text: tr('client.employment.report.intro') },
      { type: 'heading', text: tr('client.employment.report.your_data') },
      ...dataRows(input, tr),
      { type: 'heading', text: tr('client.employment.report.summary') },
      ...(scope.inScope
        ? [
            ...(scope.partial
              ? [{ type: 'note', text: tr('client.employment.partial.notice') } as const]
              : []),
            { type: 'text', text: tr(`client.employment.headline.${headline(review)}`) } as const,
          ]
        : [
            { type: 'text', text: tr('client.employment.out_of_scope.status') } as const,
            { type: 'text', text: tr(`client.employment.out_of_scope.${scope.reason}`) } as const,
          ]),
      ...review.warnings.map((w): Block => ({
        type: 'bullet',
        text: tr(`client.employment.warning.${w.code}`),
      })),
      ...(review.items.length + review.clauses.length > 0
        ? [{ type: 'heading', text: tr('client.employment.report.points') } as const]
        : []),
      ...review.items.flatMap((a) => itemBlocks(a, tr)),
      ...review.clauses.flatMap((c) => clauseBlocks(c, input, tr)),
      ...(review.informationDuty === null ? [] : dutyBlocks(review.informationDuty, tr)),
      ...(review.reference === null ? [] : referenceBlocks(review.reference, tr)),
      ...(review.offer === null ? [] : offerBlocks(review.offer, tr)),
      ...(review.information.length > 0
        ? [{ type: 'heading', text: tr('client.employment.report.information') } as const]
        : []),
      ...review.information.flatMap((b): Block[] => [
        { type: 'subheading', text: tr(`client.employment.block.${b.id}`) },
        ...calculationLines(b.calculation, tr).map((text): Block => ({ type: 'text', text })),
        ...b.links.map((l): Block => ({
          type: 'source',
          text: tr(`client.employment.link.${l.id}`),
          url: l.url,
        })),
        ...b.sources.map((s): Block => ({ type: 'source', text: s.citation, url: s.url })),
      ]),
      { type: 'heading', text: tr('client.employment.report.unchecked') },
      ...review.unchecked.map((c): Block => ({
        type: 'bullet',
        text: tr(`client.employment.unchecked.${c}`),
      })),
    ],
  };
}
