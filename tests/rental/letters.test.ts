import { describe, expect, it } from 'vitest';
import { parseDate as f, type CivilDate } from '../../src/engine/date';
import { RENTAL_TABLES } from '../../src/engine/rental/data/tables';
import type { IndexSeries } from '../../src/engine/rental/indices';
import type { ItemReading, ItemResult } from '../../src/engine/rental/item';
import type { RateFigure, RentUpdateReading } from '../../src/engine/rental/rent-update';
import {
  reviewRental,
  type RentalReview,
  type RentUpdateItem,
} from '../../src/engine/rental/review';
import type { RentalInput, ReviewDeps } from '../../src/engine/rental/types';
import { NO_DETAILS, type LetterDetails } from '../../src/documents/letter';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { rentalCase } from '../../src/rental/case';
import { depositLetter, rentalLetterKinds, rentLetter, riseLines } from '../../src/rental/letters';
import type { CompletedRentalReview } from '../../src/rental/ports';
import { NORMS_BEFORE_VOTE } from '../engine/rental/norms-before-vote';
import { FORBIDDEN } from '../support/forbidden';
import {
  contract,
  keys,
  repealedWindow,
  review,
  riseAboveIrav,
  shape,
  TODAY,
  tr,
  unknownLargeLandlord,
  update,
} from './fixtures';

const completed = (
  input: RentalInput,
  today: CivilDate = TODAY,
  deps: ReviewDeps = RENTAL_TABLES,
): CompletedRentalReview => {
  const r = reviewRental(input, today, deps);
  if (!r.ok) throw new Error(`invalid: ${JSON.stringify(r.errors)}`);
  return { review: r.review, input, detail: 'unlocked' };
};

const text = (model: DocumentModel) =>
  model.blocks
    .map((b: Block) =>
      'text' in b ? b.text : 'label' in b ? `${b.label} ${'value' in b ? b.value : ''}` : '',
    )
    .join('\n');

// Keys back 30-06-2026; 850 € of the 1.000 € came back, 150 € still out on 08-10-2026.
const depositOut = contract({
  signedOn: f('2024-03-15'),
  startDate: f('2024-03-20'),
  moveOut: {
    keysReturnedOn: f('2026-06-30'),
    returns: [{ on: f('2026-08-14'), amount: 850 }],
    deductions: [],
  },
});

// 850 € of a 2.000 € deposit came back, 1.000 € on time: the balance is owed, but no interest runs.
const balanceOnly = contract({
  signedOn: f('2024-03-15'),
  startDate: f('2024-03-20'),
  deposit: 2000,
  moveOut: {
    keysReturnedOn: f('2026-06-30'),
    returns: [{ on: f('2026-07-20'), amount: 1000 }],
    deductions: [],
  },
});

// Keys back 30-06-2025; the whole 1.000 € came back on 30-06-2026, eleven months late.
const lateInFull = contract({
  signedOn: f('2021-03-15'),
  startDate: f('2021-03-20'),
  moveOut: {
    keysReturnedOn: f('2025-06-30'),
    returns: [{ on: f('2026-06-30'), amount: 1000 }],
    deductions: [],
  },
});

// Keys back on 06-09-2026: the whole 1.000 € is owed, and a single day of interest, 0,09 € on
// either day count.
const oneDay = contract({
  moveOut: { keysReturnedOn: f('2026-09-06'), returns: [], deductions: [] },
});

// Synthetic: IRAV September 2026 2,50 % and IPC 4,90 %, out 15-10-2026. A 3 % clause on a 2021
// contract: with RDL 29/2026, the 2 % cap; without, the CPI leaves 3 %.
const SYNTHETIC = 'https://www.ine.es/synthetic';
const extend = (series: IndexSeries, month: string, rate: number): IndexSeries => ({
  ...series,
  coveredUntil: '2028-12-31',
  values: [...series.values, { month, rate, publishedOn: '2026-10-15', publishedUrl: SYNTHETIC }],
  pendingFlash: null,
});
const FUTURE: ReviewDeps = {
  ...RENTAL_TABLES,
  indices: {
    ...RENTAL_TABLES.indices,
    irav: extend(RENTAL_TABLES.indices.irav, '2026-09', 2.5),
    ipc: extend(RENTAL_TABLES.indices.ipc, '2026-09', 4.9),
  },
};
const fixedPercentRise = contract({
  signedOn: f('2021-10-15'),
  startDate: f('2021-10-20'),
  updateClause: 'fixed_percent',
  fixedPercent: 3,
  updates: [update('2026-10-20', 1000, 1040)],
});
const pendingRise = () =>
  completed(fixedPercentRise, f('2026-12-20'), { ...FUTURE, norms: NORMS_BEFORE_VOTE });
const validatedRise = () => completed(fixedPercentRise, f('2026-12-20'), FUTURE);

const details: LetterDetails = {
  ...NO_DETAILS,
  name: 'Alex Ejemplo',
  id: '00000000A',
  landlord: 'Inmuebles Ficticios SL',
  address: 'Calle Inventada 0, Villaficticia',
  place: 'Villaficticia',
  date: f('2026-10-08'),
  iban: 'ES00 0000 0000 0000 0000 0000',
};

describe('which letters a rental review offers', () => {
  it('the deposit letter only with something owed of the deposit', () => {
    expect(rentalLetterKinds(review(depositOut))).toEqual(['deposit_return']);
    const returnedInFull = contract({
      moveOut: {
        keysReturnedOn: f('2026-06-30'),
        returns: [{ on: f('2026-07-10'), amount: 1000 }],
        deductions: [],
      },
    });
    expect(rentalLetterKinds(review(returnedInFull))).toEqual([]);
    // Within the month after the keys the balance is not due yet: nothing owed, no letter.
    const notYetDue = contract({
      moveOut: { keysReturnedOn: f('2026-09-20'), returns: [], deductions: [] },
    });
    expect(rentalLetterKinds(review(notYetDue))).toEqual([]);
  });

  it('the rent letter only with a rise that has a letter amount', () => {
    expect(rentalLetterKinds(review(riseAboveIrav))).toEqual(['rent_review']);
    expect(rentalLetterKinds(review(repealedWindow))).toEqual([]);
    expect(rentalLetterKinds(review(contract()))).toEqual([]);
  });

  it('the deposit letter for a balance owed on which no interest runs', () => {
    expect(rentalLetterKinds(review(balanceOnly))).toEqual(['deposit_return']);
  });

  it('only a rise asks for rent, and only what is owed asks for the deposit', () => {
    const paidOver = { status: 'paid_over', amount: 50, accumulated: 50 } as unknown as ItemReading;
    const asRead = (base: RentalReview, kind: ItemResult['kind']): RentalReview => ({
      ...base,
      items: base.items.map((i) =>
        i.kind === kind ? { ...i, outcome: { kind: 'single', value: paidOver } } : i,
      ),
    });
    expect(rentalLetterKinds(asRead(review(balanceOnly), 'deposit_return'))).toEqual([]);
    expect(rentalLetterKinds(asRead(review(lateInFull), 'deposit_interest'))).toEqual([]);
    expect(riseLines(asRead(review(depositOut), 'deposit_return'))).toEqual([]);
  });

  it('both, deposit first', () => {
    const both = { ...riseAboveIrav, moveOut: depositOut.moveOut };
    expect(rentalLetterKinds(review(both))).toEqual(['deposit_return', 'rent_review']);
  });
});

describe('the deposit letter', () => {
  const r = () => completed(depositOut);
  const all = () => text(depositLetter(r(), TODAY, details, tr));

  it('gives the contract, the keys, what is pending and the art. 36.4 LAU', () => {
    expect(all()).toContain('con fecha 15-03-2024');
    expect(all()).toContain('Te devolví las llaves el 30-06-2026');
    expect(all()).toMatch(/queda por devolver 150,00\s€/);
    expect(all()).toContain(
      'el art. 36.4 LAU prevé interés legal pasado un mes desde la entrega de las llaves',
    );
  });

  it('gives only the lower interest, up to the last day counted', () => {
    // 150 € from 31-07-2026 to 07-10-2026 and 850 € to 13-08-2026, at 3,25 %: 1,98 € on 365
    // days, 2,01 € on 360. The letter asks only for what holds in both.
    expect(all()).toMatch(/Hasta el 07-10-2026, ese interés suma 1,98\s€\./);
    expect(all()).toContain('Esta cifra es la más baja de las cuentas posibles.');
    expect(all()).not.toMatch(/2,01|365|360/);
  });

  it('fills the account and the person’s details, and leaves no line to sign', () => {
    const model = depositLetter(r(), TODAY, details, tr);
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Cuenta (IBAN)',
      value: 'ES00 0000 0000 0000 0000 0000',
      wrap: true,
    });
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Casero',
      value: 'Inmuebles Ficticios SL',
      wrap: true,
    });
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Vivienda',
      value: 'Calle Inventada 0, Villaficticia',
      wrap: true,
    });
    expect(model.blocks.at(-1)).toEqual({
      type: 'blank',
      label: 'Nombre y apellidos',
      value: 'Alex Ejemplo',
      wrap: true,
    });
    expect(all()).toContain('En Villaficticia, a 8 de octubre de 2026');
    expect(all().toLowerCase()).not.toContain('firma');
  });

  it('leaves the lines blank when nothing was typed', () => {
    const blanks = depositLetter(r(), TODAY, NO_DETAILS, tr).blocks.filter(
      (b) => b.type === 'blank',
    );
    expect(blanks.every((b) => !('value' in b))).toBe(true);
    expect(blanks.map((b) => b.type === 'blank' && b.label)).toEqual([
      'Nombre y apellidos',
      'DNI o NIE',
      'Casero',
      'Vivienda',
      'Cuenta (IBAN)',
      'Nombre y apellidos',
    ]);
  });
});

describe('the deposit letter, deposit back in full but late', () => {
  const late = () => completed(lateInFull);

  it('is offered for the interest alone', () => {
    expect(rentalLetterKinds(late().review)).toEqual(['deposit_return']);
  });

  it('asks only for the interest of the delay, never for a deposit of 0 €', () => {
    const all = text(depositLetter(late(), TODAY, details, tr));
    expect(all).toMatch(
      /Te devolví las llaves el 30-06-2025 y me devolviste la fianza el 30-06-2026, pasado el mes que prevé el art\. 36\.4 LAU; los intereses legales de ese retraso son \d+,\d\d\s€\./,
    );
    expect(all).toContain('Te pido que me ingreses esos intereses en esta cuenta:');
    expect(all).not.toContain('queda por devolver');
    expect(all).not.toMatch(/0,00\s€/);
  });
});

describe('the rent letter', () => {
  it('words each rise: anniversary, index and month, the rent art. 18 gives, the cap and the difference', () => {
    const all = text(rentLetter(completed(riseAboveIrav), details, tr));
    expect(all).toContain('con fecha 15-03-2024');
    // The IRAV caps the IPC the contract agreed: worded as that year's cap, with its norm.
    expect(all).toMatch(
      /Subida del 20-03-2025: con el tope de ese año, el IRAV de febrero de 2025, 2,08 %, según .*Presidencia del INE\), la renta que resulta según el art\. 18 LAU es 1\.020,80\s€ al mes; pago 1\.030,00\s€, 9,20\s€ más cada mes\./,
    );
    expect(all).not.toContain('Tope legal de ese año');
    expect(all).toContain('te pido que revises el importe');
  });

  it('words a fixed cap as that year’s cap, never as the contract’s clause', () => {
    // 20-06-2024: a 5 % clause from 2020 against the 3 % cap of 2024; 1.030 € allowed.
    const all = text(
      rentLetter(
        completed(
          contract({
            signedOn: f('2020-06-15'),
            startDate: f('2020-06-20'),
            updateClause: 'fixed_percent',
            fixedPercent: 5,
            updates: [update('2024-06-20', 1000, 1050)],
          }),
        ),
        details,
        tr,
      ),
    );
    expect(all).toMatch(
      /Subida del 20-06-2024: con el tope del 3 % de ese año, según .*Ley 12\/2023.*, la renta que resulta según el art\. 18 LAU es 1\.030,00\s€ al mes; pago 1\.050,00\s€, 20,00\s€ más cada mes\./,
    );
    expect(all).not.toContain('fijo del contrato');
  });

  it('words an agreed figure below the cap as the contract’s, and names the cap apart', () => {
    // 20-06-2024: a 2 % clause, under the 3 % cap, charged at 3 %.
    const all = text(
      rentLetter(
        completed(
          contract({
            signedOn: f('2020-06-15'),
            startDate: f('2020-06-20'),
            updateClause: 'fixed_percent',
            fixedPercent: 2,
            updates: [update('2024-06-20', 1000, 1030)],
          }),
        ),
        details,
        tr,
      ),
    );
    expect(all).toMatch(/Subida del 20-06-2024: con el 2 % fijo del contrato, la renta/);
    expect(all).toMatch(/Tope legal de ese año: .*Ley 12\/2023/);
  });

  it('never carries a rise inside a repealed window', () => {
    const both = completed({
      ...repealedWindow,
      updates: [update('2025-04-15', 1000, 1030), ...repealedWindow.updates],
    });
    const lines = riseLines(both.review);
    expect(lines.map((l) => l.item.anniversary)).toEqual([f('2025-04-15')]);
    const all = text(rentLetter(both, details, tr));
    expect(all).toContain('Subida del 15-04-2025');
    expect(all).not.toContain('15-04-2026');
  });

  it('carries a rise pending validation with its lower reading, and says why', () => {
    const [line] = riseLines(pendingRise().review);
    expect(line?.pending).toBe(true);
    expect(line?.reading).toMatchObject({ maxRent: 1030, monthly: 10 });
    const all = text(rentLetter(pendingRise(), details, tr));
    expect(all).toMatch(/la renta que resulta según el art\. 18 LAU es 1\.030,00\s€ al mes/);
    expect(all).toMatch(/pago 1\.040,00\s€, 10,00\s€ más cada mes/);
    expect(all).toContain(
      'Esta cifra es la más baja de las dos cuentas posibles, porque una norma de la que depende está pendiente de convalidación por el Congreso: ',
    );
    expect(all).toContain('Real Decreto-ley 29/2026');
  });

  it('a rise under the validated RDL 29/2026 is one reading, not a pending one', () => {
    const [line] = riseLines(validatedRise().review);
    expect(line?.pending).toBe(false);
    expect(line?.reading).toMatchObject({ maxRent: 1020, monthly: 20 });
    const all = text(rentLetter(validatedRise(), details, tr));
    expect(all).toMatch(/la renta que resulta según el art\. 18 LAU es 1\.020,00\s€ al mes/);
    expect(all).not.toContain('pendiente de convalidación');
  });

  it('leaves out a doubt whose other reading cannot be checked: nothing holds in both', () => {
    const r = completed(unknownLargeLandlord);
    // «No lo sé» on a large landlord: one reading cannot be checked, so nothing holds in both.
    expect(riseLines(r.review)).toEqual([]);
  });
});

describe('the rental case', () => {
  it('offers the pass with something paid over or owed, and the letters it has figures for', () => {
    const paid = rentalCase(completed(riseAboveIrav), TODAY);
    expect(paid.offer).toBe(true);
    expect(paid.letterKinds).toEqual(['rent_review']);
    expect(paid.filename?.('report')).toBe('client.rental.report.filename');
    expect(paid.filename?.('letter', 'rent_review')).toBe('client.rental.letter.rent.filename');
    expect(paid.filename?.('letter', 'deposit_return')).toBe(
      'client.rental.letter.deposit.filename',
    );
    expect(rentalCase(completed(contract()), TODAY).offer).toBe(false);
  });

  it('with nothing over the law, still sells it quietly; with something, or nothing entered, not', () => {
    expect(rentalCase(completed(contract({ advanceMonths: 1 })), TODAY).quiet).toBe(true);
    expect(rentalCase(completed(riseAboveIrav), TODAY).quiet).toBe(false);
    expect(rentalCase(completed(contract({ deposit: null })), TODAY).quiet).toBe(false);
  });

  it('builds each letter by its kind', () => {
    const both = completed({ ...riseAboveIrav, moveOut: depositOut.moveOut });
    const paid = rentalCase(both, TODAY);
    expect(paid.letter('deposit_return', details, tr).title).toBe('Devolución de la fianza');
    expect(paid.letter('rent_review', details, tr).title).toBe('Revisión de la renta');
    expect(paid.report(tr, TODAY).title).toBe('Revisión de tu alquiler');
  });

  it('words the letters without advice, claims or a line to sign', () => {
    const both = completed({ ...riseAboveIrav, moveOut: depositOut.moveOut });
    const paid = rentalCase(both, TODAY);
    for (const model of [
      paid.letter('deposit_return', details, tr),
      paid.letter('rent_review', details, tr),
      rentLetter(pendingRise(), NO_DETAILS, tr),
    ]) {
      const all = text(model).toLowerCase();
      for (const forbidden of FORBIDDEN) expect(all).not.toMatch(forbidden);
    }
  });
});

describe('the letters block by block', () => {
  const close = [
    'text: client.rental.letter.regards',
    'text: client.documents.letter.place_date {"lugar":"Villaficticia","fecha":"8 de octubre de 2026"}',
    'blank: client.documents.letter.name',
  ];
  const head = (title: string) => [
    `title: client.rental.letter.${title}.title`,
    'blank: client.documents.letter.name',
    'blank: client.documents.letter.id',
    'blank: client.rental.letter.landlord',
    'blank: client.rental.letter.address',
  ];

  it('the deposit letter asks for the balance, the rule, the interest and the account', () => {
    expect(shape(depositLetter(completed(depositOut), TODAY, details, keys))).toEqual([
      ...head('deposit'),
      'text: client.rental.letter.deposit.body {"contrato":"15-03-2024","llaves":"30-06-2026","pendiente":"150,00 €"}',
      'text: client.rental.letter.deposit.interest_rule',
      'text: client.rental.letter.deposit.interest {"fecha":"07-10-2026","importe":"1,98 €"}',
      'note: client.rental.letter.lowest',
      'text: client.rental.letter.deposit.account',
      'blank: client.rental.letter.iban',
      ...close,
    ]);
  });

  it('the deposit letter leaves out the interest when none runs', () => {
    const lines = shape(depositLetter(completed(balanceOnly), TODAY, details, keys));
    expect(lines.slice(5, -4)).toEqual([
      expect.stringMatching(/^text: client.rental.letter.deposit.body /),
      'text: client.rental.letter.deposit.interest_rule',
      'text: client.rental.letter.deposit.account',
    ]);
  });

  it('the deposit letter words one day count without the note on the lowest', () => {
    const lines = shape(depositLetter(completed(oneDay), TODAY, details, keys));
    expect(lines.slice(5, -4)).toEqual([
      expect.stringMatching(/^text: client.rental.letter.deposit.body /),
      'text: client.rental.letter.deposit.interest_rule',
      expect.stringMatching(/^text: client.rental.letter.deposit.interest /),
      'text: client.rental.letter.deposit.account',
    ]);
  });

  it('the late deposit letter asks for the interest alone, from the last day it came back', () => {
    const twoReturns = contract({
      ...lateInFull,
      moveOut: {
        keysReturnedOn: f('2025-06-30'),
        returns: [
          { on: f('2026-06-30'), amount: 600 },
          { on: f('2025-09-15'), amount: 400 },
        ],
        deductions: [],
      },
    });
    const lines = shape(depositLetter(completed(twoReturns), TODAY, details, keys));
    expect(lines.slice(5, -4)).toEqual([
      expect.stringMatching(
        /^text: client.rental.letter.deposit.body_late .*"devuelta":"30-06-2026"/,
      ),
      'note: client.rental.letter.lowest',
      'text: client.rental.letter.deposit.account_interest',
    ]);
  });

  it('the rent letter asks for each rise, its cap and what is pending', () => {
    expect(shape(rentLetter(pendingRise(), details, keys))).toEqual([
      ...head('rent'),
      'text: client.rental.letter.rent.body {"contrato":"15-10-2021"}',
      expect.stringMatching(/^bullet: client.rental.letter.rent.line \{"subida":.*"criterio":/),
      'note: client.rental.letter.rent.cap {"norma":"LAU, art. 18.1, párrafo tercero (Real Decreto-ley 7/2019, de 1 de marzo)"}',
      expect.stringMatching(/^note: client.rental.letter.rent.pending \{"normas":"art. 4.Dos/),
      'text: client.rental.letter.rent.ask',
      ...close,
    ]);
  });
});

describe('the rent letter, line by line', () => {
  const reshaped = (
    r: CompletedRentalReview,
    change: (item: RentUpdateItem) => Partial<RentUpdateItem>,
  ): CompletedRentalReview => ({
    ...r,
    review: {
      ...r.review,
      items: r.review.items.map((i) => (i.kind === 'rent_update' ? { ...i, ...change(i) } : i)),
    },
  });
  const withReading = (r: CompletedRentalReview, patch: Partial<RentUpdateReading>) =>
    reshaped(r, (item) => {
      const { outcome } = item;
      return {
        outcome:
          outcome.kind === 'single'
            ? { ...outcome, value: { ...outcome.value, ...patch } }
            : { ...outcome, low: { ...outcome.low, ...patch } },
      };
    });
  const index = (flash: boolean): RateFigure => ({
    kind: 'index',
    figure: {
      index: 'ipc',
      month: '2025-02',
      rate: 3,
      publishedOn: '2025-03-14',
      flash,
      clampedFrom: null,
    },
  });
  const fixed = (rate: number): RateFigure => ({ kind: 'fixed', rate });
  const cap = (rate: RateFigure) => ({ rule: 'cap_irav' as const, rate });
  const lines = (r: CompletedRentalReview) => shape(rentLetter(r, details, keys)).slice(6, -4);

  it.each([
    ['the agreed index when no cap applies', index(false), null, 'rent.index {', false],
    ['a flash index, worded as such', index(true), null, 'rent.index_flash {', false],
    [
      'the cap when it is lower than the agreed index',
      index(false),
      fixed(2.08),
      'rent.cap_fixed',
      false,
    ],
    ['the cap when it equals the agreed figure', fixed(2), fixed(2), 'rent.cap_fixed', false],
    ['the cap alone when nothing was agreed', null, fixed(2), 'rent.cap_fixed', false],
    ['a cap that is an index', null, index(true), 'rent.cap_index', false],
    [
      'the agreed figure when it is lower than the cap, naming the cap apart',
      fixed(1),
      fixed(2),
      'rent.fixed',
      true,
    ],
  ] as const)('words %s', (_, agreed, capRate, criterion, capNoted) => {
    const r = withReading(completed(riseAboveIrav), {
      agreed,
      cap: capRate && cap(capRate),
    });
    const [bullet, ...notes] = lines(r);
    expect(bullet).toContain(`"criterio":"client.rental.letter.${criterion}`);
    expect(notes.some((n) => n.startsWith('note: client.rental.letter.rent.cap '))).toBe(capNoted);
  });

  it('says so when no figure was agreed and no cap applied', () => {
    const noClause = contract({ ...riseAboveIrav, updateClause: 'none' });
    const [bullet, ...notes] = lines(completed(noClause));
    expect(bullet).toMatch(/^bullet: client.rental.letter.rent.line_no_rate /);
    expect(notes).toEqual([]);
  });

  it('puts the rent paid as it was entered, or none when the rise has no row', () => {
    const r = completed(riseAboveIrav);
    expect(lines(r)[0]).toContain('"pagada":"1.030,00' + String.fromCharCode(160) + '€"');
    expect(lines({ ...r, input: { ...r.input, updates: [] } })[0]).toContain(
      '"pagada":"0,00' + String.fromCharCode(160) + '€"',
    );
  });

  it('notes the lowest reading of a doubt that is not a pending norm', () => {
    const byEmail = contract({
      ...riseAboveIrav,
      updates: [update('2025-03-20', 1000, 1030, { notice: 'email' })],
    });
    expect(lines(completed(byEmail)).slice(1)).toEqual(['note: client.rental.letter.lowest']);
  });

  it('says a norm is pending only for the lower of two readings that rests on it', () => {
    const pendingSources = (r: CompletedRentalReview, status: 'pending_validation' | 'in_force') =>
      reshaped(r, (item) => ({ sources: item.sources.map((s) => ({ ...s, status })) }));
    const noted = (r: CompletedRentalReview) => lines(r).some((l) => l.includes('rent.pending'));
    expect(noted(pendingRise())).toBe(true);
    expect(noted(pendingSources(pendingRise(), 'in_force'))).toBe(false);
    expect(lines(pendingSources(pendingRise(), 'in_force')).slice(-1)).toEqual([
      'note: client.rental.letter.lowest',
    ]);
    expect(lines(pendingSources(completed(riseAboveIrav), 'pending_validation')).slice(1)).toEqual(
      [],
    );
  });
});

describe('the deposit letter without a move-out', () => {
  it('leaves the day of the keys blank', () => {
    const lines = shape(depositLetter(completed(contract()), TODAY, details, keys));
    expect(lines[5]).toContain('"llaves":""');
  });
});
