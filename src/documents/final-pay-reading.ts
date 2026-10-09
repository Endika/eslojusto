import type { FormEntries } from '../calculator/fill';
import { formatEuros } from '../calculator/number';
import type { Translate } from '../i18n/client';
import type { ExtractedFieldName } from './contract';
import type { DocumentReading, ReadMark } from './ports';
import {
  hasHolidayDays,
  hasLowConfidence,
  prefillFrom,
  prefilledCount,
  type Prefill,
} from './prefill';
import { conflictLines } from './summary';

// The prefill as form answers, its rows of «Otros trabajos» numbered from 0: the upload adds them
// to the rows the form already has.
export function prefillEntries(p: Prefill): FormEntries {
  const entries: [string, string][] = p.fields.map((f) => [f.name, f.value]);
  if (p.otherContracts && p.otherContracts.length > 0) {
    entries.push(['otherContracts', 'yes']);
    p.otherContracts.forEach((c, i) => {
      entries.push([`otherContracts.${i}.startDate`, c.startDate]);
      entries.push([`otherContracts.${i}.endDate`, c.endDate]);
    });
  }
  return entries;
}

const otherContract = (row: number) => `[data-other-contract="${row}"] fieldset`;

const marksOf = (p: Prefill): ReadMark[] => [
  ...p.fields.map((f) => ({
    id: f.name,
    container: `[data-field="${f.name}"]`,
    confidence: f.confidence,
    ...(f.derived && { derived: f.derived }),
  })),
  ...(p.otherContracts ?? []).map((c, i) => ({
    id: `otherContracts.${i}`,
    container: otherContract(i),
    confidence: c.confidence,
  })),
];

export interface FinalPayReading extends DocumentReading<ExtractedFieldName, 'contracts'> {
  // Beside the severance of a result: what the uploaded agreement offers, as a figure only.
  showAgreementOffer(result: ParentNode): void;
}

// What an uploaded agreement offers as severance is kept from the last read until the form
// restarts.
export function finalPayReading(form: HTMLFormElement, tr: Translate): FinalPayReading {
  let agreementOffer: number | null = null;
  form.addEventListener('reset', () => (agreementOffer = null));

  return {
    prefill(extraction, answers) {
      const p = prefillFrom(extraction, {
        ...(answers['startDate'] ? { startDate: answers['startDate'] } : {}),
        ...(answers['endDate'] ? { endDate: answers['endDate'] } : {}),
      });
      const offer = extraction.fields.agreementSeveranceTotal;
      agreementOffer = offer && typeof offer.value === 'number' ? offer.value : null;
      return {
        entries: prefillEntries(p),
        marks: marksOf(p),
        count: prefilledCount(p),
        lowConfidence: hasLowConfidence(p),
        notes: [
          ...conflictLines(extraction.conflicts, tr),
          ...(hasLowConfidence(p) ? [tr('client.documents.done_low')] : []),
          ...(hasHolidayDays(p) ? [tr('client.documents.holiday_unit')] : []),
        ],
      };
    },
    // One job per start date.
    lists: {
      otherContracts: { identity: ['startDate'], max: Infinity, rowContainer: otherContract },
    },
    showAgreementOffer(result) {
      const sheet = result.querySelector('[data-item="severance"]');
      sheet?.querySelector('[data-agreement-offer]')?.remove();
      if (!sheet || agreementOffer === null) return;
      const note = document.createElement('p');
      note.className = 'item__note';
      note.dataset['agreementOffer'] = '';
      note.textContent = tr('client.documents.agreement_offer', {
        importe: formatEuros(agreementOffer),
      });
      const reference = sheet.querySelector('[data-reference]');
      if (reference) reference.after(note);
      else sheet.append(note);
    },
  };
}
