import { toIso, type CivilDate } from '../engine/date';
import { itemAmount, type ItemResult } from '../engine/rental/item';
import { countedAmount, highestAmount, letterAmount } from '../engine/rental/outcome';
import {
  rentUpdateAmount,
  type RateFigure,
  type RentUpdateReading,
} from '../engine/rental/rent-update';
import type { RentalReview, RentUpdateItem } from '../engine/rental/review';
import { formatEuros } from '../calculator/number';
import { longDate, type LetterDetails, type LetterKind } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { Translate } from '../i18n/client';
import type { CompletedRentalReview } from './ports';
import { dayText, monthText, percentText } from './render';

const day = (d: CivilDate) => dayText(toIso(d));

const blank = (label: string, value = ''): Block => {
  const v = value.trim();
  return v === '' ? { type: 'blank', label } : { type: 'blank', label, value: v };
};

const itemOf = (review: RentalReview, kind: ItemResult['kind']): ItemResult | undefined =>
  review.items.find((i): i is ItemResult => i.kind === kind);

// What is still to come back of the deposit in every reading; null when nothing is owed.
export const depositOwed = (review: RentalReview): number | null => {
  const item = itemOf(review, 'deposit_return');
  return item ? letterAmount(item.outcome, (r) => (r.status === 'owed' ? itemAmount(r) : 0)) : null;
};

// A rise the rent letter asks to look at again: what holds in every reading and is above zero,
// never one inside a repealed norm's window, with the lowest reading to word it.
export interface RiseLine {
  readonly item: RentUpdateItem;
  readonly reading: RentUpdateReading;
  readonly pending: boolean;
}

export function riseLines(review: RentalReview): readonly RiseLine[] {
  return review.items.flatMap((item): RiseLine[] => {
    if (item.kind !== 'rent_update' || letterAmount(item.outcome, rentUpdateAmount) === null)
      return [];
    const { outcome } = item;
    return outcome.kind === 'single'
      ? [{ item, reading: outcome.value, pending: false }]
      : [{ item, reading: outcome.low, pending: outcome.reasons.includes('pending_validation') }];
  });
}

// The deposit letter with something still owed for it; the rent letter with some rise to look at.
export function rentalLetterKinds(review: RentalReview): LetterKind[] {
  return [
    ...(depositOwed(review) !== null ? (['deposit_return'] as const) : []),
    ...(riseLines(review).length > 0 ? (['rent_review'] as const) : []),
  ];
}

function header(title: string, details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'title', text: title },
    blank(tr('client.documents.letter.name'), details.name),
    blank(tr('client.documents.letter.id'), details.id),
    blank(tr('client.rental.letter.landlord'), details.landlord),
    blank(tr('client.rental.letter.address'), details.address),
  ];
}

function closing(details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'text', text: tr('client.rental.letter.regards') },
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

// The interest up to the day of the review: one figure, or the two the year's day count gives.
function interestBlocks(review: RentalReview, today: CivilDate, tr: Translate): Block[] {
  const item = itemOf(review, 'deposit_interest');
  if (!item) return [];
  const owed = (r: Parameters<typeof itemAmount>[0]) => (r.status === 'owed' ? itemAmount(r) : 0);
  const low = countedAmount(item.outcome, owed);
  const high = highestAmount(item.outcome, owed);
  if (high <= 0) return [];
  const fecha = day(today);
  return [
    {
      type: 'text',
      text:
        low === high
          ? tr('client.rental.letter.deposit.interest', { fecha, importe: formatEuros(low) })
          : tr('client.rental.letter.deposit.interest_range', {
              fecha,
              minimo: formatEuros(low),
              maximo: formatEuros(high),
            }),
    },
  ];
}

// Asks for the deposit back: the contract, the day of the keys, what is pending, what art. 36.4
// LAU says of interest, the interest so far and the account to pay it into.
export function depositLetter(
  r: CompletedRentalReview,
  today: CivilDate,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const { input, review } = r;
  const title = tr('client.rental.letter.deposit.title');
  return {
    title,
    footer: null,
    blocks: [
      ...header(title, details, tr),
      {
        type: 'text',
        text: tr('client.rental.letter.deposit.body', {
          contrato: day(input.signedOn),
          llaves: input.moveOut ? day(input.moveOut.keysReturnedOn) : '',
          pendiente: formatEuros(depositOwed(review) ?? 0),
        }),
      },
      { type: 'text', text: tr('client.rental.letter.deposit.interest_rule') },
      ...interestBlocks(review, today, tr),
      { type: 'text', text: tr('client.rental.letter.deposit.account') },
      blank(tr('client.rental.letter.iban'), details.iban),
      ...closing(details, tr),
    ],
  };
}

const rateValue = (rate: RateFigure): number =>
  rate.kind === 'fixed' ? rate.rate : rate.figure.rate;

// The figure that sets the rent the update allows: the agreed one, or the cap when it is lower.
function bindingRate(r: RentUpdateReading): RateFigure | null {
  const cap = r.cap?.rate ?? null;
  if (cap && (r.agreed === null || rateValue(cap) <= rateValue(r.agreed))) return cap;
  return r.agreed;
}

function rateWords(rate: RateFigure, tr: Translate): string {
  if (rate.kind === 'fixed')
    return tr('client.rental.letter.rent.fixed', { tasa: percentText(rate.rate) });
  const f = rate.figure;
  return tr(f.flash ? 'client.rental.letter.rent.index_flash' : 'client.rental.letter.rent.index', {
    indice: tr(`client.rental.index.${f.index}`),
    mes: monthText(f.month),
    tasa: percentText(f.rate),
  });
}

function riseBlocks(line: RiseLine, input: CompletedRentalReview['input'], tr: Translate): Block[] {
  const { item, reading } = line;
  const rate = bindingRate(reading);
  const cap = reading.cap && item.sources.find((s) => s.id === reading.cap?.rule);
  const subida = tr('client.rental.letter.rent.rise', { aniversario: day(item.anniversary) });
  const pending = item.sources
    .filter((s) => s.status === 'pending_validation')
    .map((s) => s.citation);
  return [
    {
      type: 'bullet',
      text: tr('client.rental.letter.rent.line', {
        subida: rate ? `${subida} (${rateWords(rate, tr)})` : subida,
        renta: formatEuros(reading.maxRent ?? 0),
        pagada: formatEuros(input.updates[item.index]?.newRent ?? 0),
        diferencia: formatEuros(reading.monthly),
      }),
    },
    ...(cap
      ? [
          {
            type: 'note',
            text: tr('client.rental.letter.rent.cap', { norma: cap.citation }),
          } as const,
        ]
      : []),
    ...(line.pending && pending.length > 0
      ? [
          {
            type: 'note',
            text: tr('client.rental.letter.rent.pending', { normas: pending.join('; ') }),
          } as const,
        ]
      : item.outcome.kind === 'depends'
        ? [{ type: 'note', text: tr('client.rental.letter.rent.lowest') } as const]
        : []),
  ];
}

// Asks the landlord to look again at each rise above what art. 18 LAU and that year's cap allow,
// with the rent that results and the difference each month.
export function rentLetter(
  r: CompletedRentalReview,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const title = tr('client.rental.letter.rent.title');
  return {
    title,
    footer: null,
    blocks: [
      ...header(title, details, tr),
      {
        type: 'text',
        text: tr('client.rental.letter.rent.body', { contrato: day(r.input.signedOn) }),
      },
      ...riseLines(r.review).flatMap((line) => riseBlocks(line, r.input, tr)),
      { type: 'text', text: tr('client.rental.letter.rent.ask') },
      ...closing(details, tr),
    ],
  };
}
