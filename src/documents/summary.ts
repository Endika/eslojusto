import type { ClientKey, Translate } from '../i18n/client';
import type { Conflict, RecognisedDocument } from './contract';

const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });

// The kinds of document named with their month: a payslip, a rent receipt, a card statement.
const MONTHLY: Partial<Record<RecognisedDocument['kind'], ClientKey>> = {
  payslip: 'client.documents.kind.payslip_month',
  rent_receipt: 'client.documents.kind.rent_receipt_month',
  card_statement: 'client.documents.kind.card_statement_month',
};

function documentName(d: RecognisedDocument, tr: Translate): string {
  const monthly = d.month ? MONTHLY[d.kind] : undefined;
  const name = monthly
    ? tr(monthly, { mes: MONTH.format(new Date(`${d.month}-01T00:00:00Z`)) })
    : tr(`client.documents.kind.${d.kind}` as ClientKey);
  return d.pages > 1 ? tr('client.documents.kind.pages', { nombre: name, n: d.pages }) : name;
}

// «Carta de despido (6 páginas) · Nómina de agosto · … · 1 página sin datos útiles», or '' when
// nothing was recognised.
export function recognisedLine(documents: readonly RecognisedDocument[], tr: Translate): string {
  const named = documents.filter((d) => d.kind !== 'other').map((d) => documentName(d, tr));
  const other = documents.filter((d) => d.kind === 'other').reduce((n, d) => n + d.pages, 0);
  if (other > 0)
    named.push(
      other === 1
        ? tr('client.documents.kind.other_one')
        : tr('client.documents.kind.other_many', { n: other }),
    );
  return named.join(' · ');
}

// The fields more than one kind of document can state, so the only ones that can disagree.
export const CONFLICT_FIELDS = [
  'startDate',
  'endDate',
  'cause',
  'fixedTermType',
  'pending_salary',
  'holiday_pay',
  'extra_pay',
  'severance',
  'employer_notice',
  'notice_deduction',
  'annualHolidayDays',
  'holidayDaysTaken',
] as const;

// Of the rental documents, only the contract and the deposit return both state the deposit.
export const RENTAL_CONFLICT_FIELDS = ['deposit'] as const;

// Of the mortgage documents, the deed and the FEIN both state the capital and the initial rate.
export const MORTGAGE_CONFLICT_FIELDS = ['principal', 'initialRate'] as const;

// One plain sentence per field the documents state differently, naming the one that was used.
export function conflictLines<F extends string>(
  conflicts: readonly Conflict<F>[],
  tr: Translate,
  fields: readonly string[] = CONFLICT_FIELDS,
): string[] {
  return conflicts.flatMap((c) => {
    const kept = c.sources[0];
    if (!kept || !fields.includes(c.field)) return [];
    return [
      tr('client.documents.conflict', {
        dato: tr(`client.documents.field.${c.field}` as ClientKey),
        fuente: tr(`client.documents.source.${kept}` as ClientKey),
      }),
    ];
  });
}
