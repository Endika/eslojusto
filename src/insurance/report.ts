import type { CivilDate } from '../engine/date';
import type { InsuranceInput } from '../engine/insurance/types';
import type { NormSource } from '../engine/law/sources';
import { formatEuros } from '../calculator/number';
import { longDate } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { Translate } from '../i18n/client';
import type { CompletedInsuranceReview } from './ports';
import { calculationLines, civilDayText as day, normStatusText, statusText } from './render';

const row = (label: string, value: string): Block => ({ type: 'row', label, value });

const answer = (v: boolean | null, tr: Translate) =>
  tr(
    v === null
      ? 'client.insurance.answer.unknown'
      : v
        ? 'client.insurance.answer.yes'
        : 'client.insurance.answer.no',
  );

// What the person confirmed, as the review read it.
function dataRows(input: InsuranceInput, tr: Translate): Block[] {
  const notice = input.notice;
  return [
    row(tr('client.insurance.report.line'), tr(`client.insurance.report.line.${input.line}`)),
    row(tr('client.insurance.report.expires'), day(input.expiresOn)),
    row(tr('client.insurance.report.renews'), answer(input.renews, tr)),
    row(tr('client.insurance.report.distance'), answer(input.distance, tr)),
    ...(input.concludedOn === null
      ? []
      : [row(tr('client.insurance.report.concluded'), day(input.concludedOn))]),
    ...(notice === null
      ? []
      : [
          row(tr('client.insurance.report.notice'), day(notice.receivedOn)),
          ...(notice.previousPremium === null
            ? []
            : [row(tr('client.insurance.report.previous'), formatEuros(notice.previousPremium))]),
          ...(notice.newPremium === null
            ? []
            : [row(tr('client.insurance.report.next'), formatEuros(notice.newPremium))]),
        ]),
  ];
}

const sourceBlock = (s: NormSource, tr: Translate): Block => ({
  type: 'source',
  text: `${s.citation} · ${normStatusText(s, tr)}`,
  url: s.url,
});

// The review of the policy's dates, finding by finding with its calculation and norms, as the
// person confirmed it, dated the day it is made.
export function insuranceReport(
  { input, review }: CompletedInsuranceReview,
  tr: Translate,
  today: CivilDate,
): DocumentModel {
  const sources = [
    ...review.findings.flatMap((f) => f.sources),
    ...review.information.flatMap((b) => b.sources),
  ].filter((s, i, all) => all.findIndex((o) => o.citation === s.citation) === i);
  return {
    title: tr('client.insurance.report.title'),
    footer: tr('client.insurance.report.footer', { fecha: longDate(today) }),
    blocks: [
      { type: 'title', text: tr('client.insurance.report.title') },
      { type: 'meta', text: tr('client.documents.report.generated', { fecha: longDate(today) }) },
      { type: 'rule' },
      { type: 'text', text: tr('client.insurance.report.intro') },
      { type: 'heading', text: tr('client.insurance.report.your_data') },
      ...dataRows(input, tr),
      { type: 'heading', text: tr('client.insurance.report.items') },
      ...review.findings.flatMap((f): Block[] => [
        { type: 'subheading', text: tr(`client.insurance.item.${f.id}`) },
        { type: 'text', text: statusText(f, tr) },
        ...calculationLines(f.calculation, tr).map((text): Block => ({ type: 'bullet', text })),
      ]),
      { type: 'heading', text: tr('client.insurance.report.norms') },
      ...sources.map((s) => sourceBlock(s, tr)),
      ...(review.information.length > 0
        ? [{ type: 'heading', text: tr('client.insurance.report.information') } as const]
        : []),
      ...review.information.flatMap((b): Block[] => [
        { type: 'subheading', text: tr(`client.insurance.info.${b.id}`) },
        { type: 'text', text: calculationLines(b.calculation, tr).join(' ') },
      ]),
      { type: 'heading', text: tr('client.insurance.report.unchecked') },
      ...review.unchecked.map((c): Block => ({
        type: 'bullet',
        text: tr(`client.insurance.unchecked.${c}`),
      })),
    ],
  };
}
