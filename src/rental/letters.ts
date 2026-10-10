import { addDays, compareDates, toIso, type CivilDate } from '../engine/date';
import { itemAmount, type ItemReading, type ItemResult } from '../engine/rental/item';
import { letterAmount } from '../engine/rental/outcome';
import {
  rentUpdateAmount,
  type RateFigure,
  type RentUpdateReading,
} from '../engine/rental/rent-update';
import type { RentalReview, RentUpdateItem } from '../engine/rental/review';
import type { MoveOut } from '../engine/rental/types';
import { formatEuros } from '../calculator/number';
import { detailLine, placeAndDate, type LetterDetails, type LetterKind } from '../documents/letter';
import type { Block, DocumentModel } from '../documents/ports';
import type { Translate } from '../i18n/client';
import type { CompletedRentalReview } from './ports';
import { dayText, monthText, percentText } from './render';

const day = (d: CivilDate) => dayText(toIso(d));

const itemOf = (review: RentalReview, kind: ItemResult['kind']): ItemResult | undefined =>
  review.items.find((i): i is ItemResult => i.kind === kind);

const owedAmount = (r: ItemReading): number => (r.status === 'owed' ? itemAmount(r) : 0);

// What is still to come back of the deposit in every reading; null when nothing is owed.
export const depositOwed = (review: RentalReview): number | null => {
  const item = itemOf(review, 'deposit_return');
  return item ? letterAmount(item.outcome, owedAmount) : null;
};

// The interest for the delay in every reading: the lowest, never the day count that gives more;
// null when there is none.
export const interestOwed = (review: RentalReview): number | null => {
  const item = itemOf(review, 'deposit_interest');
  return item ? letterAmount(item.outcome, owedAmount) : null;
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

// The deposit letter with something still owed of it or of its interest; the rent letter with some
// rise to look at.
export function rentalLetterKinds(review: RentalReview): LetterKind[] {
  return [
    ...(depositOwed(review) !== null || interestOwed(review) !== null
      ? (['deposit_return'] as const)
      : []),
    ...(riseLines(review).length > 0 ? (['rent_review'] as const) : []),
  ];
}

function header(title: string, details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'title', text: title },
    detailLine(tr('client.documents.letter.name'), details.name),
    detailLine(tr('client.documents.letter.id'), details.id),
    detailLine(tr('client.rental.letter.landlord'), details.landlord),
    detailLine(tr('client.rental.letter.address'), details.address),
  ];
}

function closing(details: LetterDetails, tr: Translate): Block[] {
  return [
    { type: 'text', text: tr('client.rental.letter.regards') },
    placeAndDate(details, tr),
    detailLine(tr('client.documents.letter.name'), details.name),
  ];
}

// The interest the balance still out has run up to, the last day counted being the eve of the
// review; only the lowest reading, as with every figure in a letter.
function interestBlocks(review: RentalReview, today: CivilDate, tr: Translate): Block[] {
  const interest = interestOwed(review);
  if (interest === null) return [];
  const item = itemOf(review, 'deposit_interest');
  return [
    {
      type: 'text',
      text: tr('client.rental.letter.deposit.interest', {
        fecha: day(addDays(today, -1)),
        importe: formatEuros(interest),
      }),
    },
    ...(item?.outcome.kind === 'depends'
      ? [{ type: 'note', text: tr('client.rental.letter.lowest') } as const]
      : []),
  ];
}

// The day the last of the deposit came back.
const lastReturn = (out: MoveOut): CivilDate | null =>
  out.returns.reduce<CivilDate | null>(
    (last, r) => (last === null || compareDates(r.on, last) > 0 ? r.on : last),
    null,
  );

// Asks for the deposit back: the contract, the day of the keys, what is pending, what art. 36.4
// LAU says of interest, the interest so far and the account to pay it into. With the deposit
// back in full but late, it asks only for the interest of the delay.
export function depositLetter(
  r: CompletedRentalReview,
  today: CivilDate,
  details: LetterDetails,
  tr: Translate,
): DocumentModel {
  const { input, review } = r;
  const title = tr('client.rental.letter.deposit.title');
  const pending = depositOwed(review);
  const out = input.moveOut;
  const keys = out ? day(out.keysReturnedOn) : '';
  const returned = out && lastReturn(out);
  const body: Block[] =
    pending !== null || returned === null
      ? [
          {
            type: 'text',
            text: tr('client.rental.letter.deposit.body', {
              contrato: day(input.signedOn),
              llaves: keys,
              pendiente: formatEuros(pending ?? 0),
            }),
          },
          { type: 'text', text: tr('client.rental.letter.deposit.interest_rule') },
          ...interestBlocks(review, today, tr),
          { type: 'text', text: tr('client.rental.letter.deposit.account') },
        ]
      : [
          {
            type: 'text',
            text: tr('client.rental.letter.deposit.body_late', {
              contrato: day(input.signedOn),
              llaves: keys,
              devuelta: day(returned),
              importe: formatEuros(interestOwed(review) ?? 0),
            }),
          },
          ...(itemOf(review, 'deposit_interest')?.outcome.kind === 'depends'
            ? [{ type: 'note', text: tr('client.rental.letter.lowest') } as const]
            : []),
          { type: 'text', text: tr('client.rental.letter.deposit.account_interest') },
        ];
  return {
    title,
    footer: null,
    blocks: [
      ...header(title, details, tr),
      ...body,
      detailLine(tr('client.rental.letter.iban'), details.iban),
      ...closing(details, tr),
    ],
  };
}

const rateValue = (rate: RateFigure): number =>
  rate.kind === 'fixed' ? rate.rate : rate.figure.rate;

// The figure that sets the rent the update allows: the agreed one, or the cap when it is lower.
function bindingRate(
  r: RentUpdateReading,
): { readonly rate: RateFigure; readonly cap: boolean } | null {
  const cap = r.cap?.rate ?? null;
  if (cap && (r.agreed === null || rateValue(cap) <= rateValue(r.agreed)))
    return { rate: cap, cap: true };
  return r.agreed && { rate: r.agreed, cap: false };
}

// The agreed figure as the contract has it; a cap as the year's cap, with its norm.
function rateWords(rate: RateFigure, cap: string | null, tr: Translate): string {
  if (rate.kind === 'fixed')
    return cap === null
      ? tr('client.rental.letter.rent.fixed', { tasa: percentText(rate.rate) })
      : tr('client.rental.letter.rent.cap_fixed', { tasa: percentText(rate.rate), norma: cap });
  const f = rate.figure;
  const vars = {
    indice: tr(`client.rental.index.${f.index}`),
    mes: monthText(f.month),
    tasa: percentText(f.rate),
  };
  const words = tr(
    f.flash ? 'client.rental.letter.rent.index_flash' : 'client.rental.letter.rent.index',
    vars,
  );
  return cap === null
    ? words
    : tr('client.rental.letter.rent.cap_index', { indice: words, norma: cap });
}

function riseBlocks(line: RiseLine, input: CompletedRentalReview['input'], tr: Translate): Block[] {
  const { item, reading } = line;
  const binding = bindingRate(reading);
  const cap = reading.cap && item.sources.find((s) => s.id === reading.cap?.rule);
  const capCitation = cap ? cap.citation : null;
  const subida = tr('client.rental.letter.rent.rise', { aniversario: day(item.anniversary) });
  const pending = item.sources
    .filter((s) => s.status === 'pending_validation')
    .map((s) => s.citation);
  const figures = {
    subida,
    renta: formatEuros(reading.maxRent ?? 0),
    pagada: formatEuros(input.updates[item.index]?.newRent ?? 0),
    diferencia: formatEuros(reading.monthly),
  };
  return [
    {
      type: 'bullet',
      text: binding
        ? tr('client.rental.letter.rent.line', {
            ...figures,
            criterio: rateWords(binding.rate, binding.cap ? (capCitation ?? '') : null, tr),
          })
        : tr('client.rental.letter.rent.line_no_rate', figures),
    },
    // A cap that did not set the rent is still named: art. 18 and that year's cap.
    ...(cap && !binding?.cap
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
        ? [{ type: 'note', text: tr('client.rental.letter.lowest') } as const]
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
