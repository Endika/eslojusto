import type { ClientKey, Translate } from '../i18n/client';
import type { Conflict, RecognisedDocument } from './contract';

const MONTH = new Intl.DateTimeFormat('es-ES', { month: 'long', timeZone: 'UTC' });

function documentName(d: RecognisedDocument, tr: Translate): string {
  const month = d.kind === 'payslip' && d.month ? d.month : null;
  const name = month
    ? tr('client.documents.kind.payslip_month', {
        mes: MONTH.format(new Date(`${month}-01T00:00:00Z`)),
      })
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

// One plain sentence per field the documents state differently, naming the one that was used.
export function conflictLines(conflicts: readonly Conflict[], tr: Translate): string[] {
  return conflicts.flatMap((c) => {
    const kept = c.sources[0];
    if (!kept || !(CONFLICT_FIELDS as readonly string[]).includes(c.field)) return [];
    return [
      tr('client.documents.conflict', {
        dato: tr(`client.documents.field.${c.field}` as ClientKey),
        fuente: tr(`client.documents.source.${kept}` as ClientKey),
      }),
    ];
  });
}
