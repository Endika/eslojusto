import { describe, expect, it } from 'vitest';
import { parseDate as f, type CivilDate } from '../../src/engine/date';
import { RENTAL_TABLES } from '../../src/engine/rental/data/tables';
import type { IndexSeries } from '../../src/engine/rental/indices';
import { reviewRental } from '../../src/engine/rental/review';
import type { RentalInput, ReviewDeps } from '../../src/engine/rental/types';
import { NO_DETAILS, type LetterDetails } from '../../src/documents/letter';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { rentalCase } from '../../src/rental/case';
import { depositLetter, rentalLetterKinds, rentLetter, riseLines } from '../../src/rental/letters';
import type { CompletedRentalReview } from '../../src/rental/ports';
import { FORBIDDEN } from '../support/forbidden';
import {
  contract,
  repealedWindow,
  review,
  riseAboveIrav,
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
const pendingRise = completed(
  contract({
    signedOn: f('2021-10-15'),
    startDate: f('2021-10-20'),
    updateClause: 'fixed_percent',
    fixedPercent: 3,
    updates: [update('2026-10-20', 1000, 1040)],
  }),
  f('2026-12-20'),
  FUTURE,
);

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

  it('both, deposit first', () => {
    const both = { ...riseAboveIrav, moveOut: depositOut.moveOut };
    expect(rentalLetterKinds(review(both))).toEqual(['deposit_return', 'rent_review']);
  });
});

describe('the deposit letter', () => {
  const r = completed(depositOut);
  const all = text(depositLetter(r, TODAY, details, tr));

  it('gives the contract, the keys, what is pending and the art. 36.4 LAU', () => {
    expect(all).toContain('con fecha 15-03-2024');
    expect(all).toContain('Te devolví las llaves el 30-06-2026');
    expect(all).toMatch(/queda por devolver 150,00\s€/);
    expect(all).toContain(
      'el art. 36.4 LAU prevé interés legal pasado un mes desde la entrega de las llaves',
    );
  });

  it('gives the interest up to today as a range when the day count moves it', () => {
    expect(all).toMatch(
      /Hasta el 08-10-2026, ese interés suma entre \d+,\d\d\s€ y \d+,\d\d\s€, según se cuente el año de 365 días o de 360\./,
    );
  });

  it('fills the account and the person’s details, and leaves no line to sign', () => {
    const model = depositLetter(r, TODAY, details, tr);
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Cuenta (IBAN)',
      value: 'ES00 0000 0000 0000 0000 0000',
    });
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Casero',
      value: 'Inmuebles Ficticios SL',
    });
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Vivienda',
      value: 'Calle Inventada 0, Villaficticia',
    });
    expect(model.blocks.at(-1)).toEqual({
      type: 'blank',
      label: 'Nombre y apellidos',
      value: 'Alex Ejemplo',
    });
    expect(all).toContain('En Villaficticia, a 8 de octubre de 2026');
    expect(all.toLowerCase()).not.toContain('firma');
  });

  it('leaves the lines blank when nothing was typed', () => {
    const blanks = depositLetter(r, TODAY, NO_DETAILS, tr).blocks.filter((b) => b.type === 'blank');
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

describe('the rent letter', () => {
  it('words each rise: anniversary, index and month, the rent art. 18 gives, the cap and the difference', () => {
    const all = text(rentLetter(completed(riseAboveIrav), details, tr));
    expect(all).toContain('con fecha 15-03-2024');
    expect(all).toMatch(
      /Subida del 20-03-2025 \(el IRAV de febrero de 2025, 2,08 %\): la renta que resulta según el art\. 18 LAU es 1\.020,80\s€ al mes; pago 1\.030,00\s€, 9,20\s€ más cada mes\./,
    );
    expect(all).toMatch(/Tope legal de ese año: .*Presidencia del INE\)\./);
    expect(all).toContain('te pido que revises el importe');
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
    const [line] = riseLines(pendingRise.review);
    expect(line?.pending).toBe(true);
    expect(line?.reading).toMatchObject({ maxRent: 1030, monthly: 10 });
    const all = text(rentLetter(pendingRise, details, tr));
    expect(all).toMatch(/la renta que resulta según el art\. 18 LAU es 1\.030,00\s€ al mes/);
    expect(all).toMatch(/pago 1\.040,00\s€, 10,00\s€ más cada mes/);
    expect(all).toContain(
      'Esta cifra es la más baja de las dos cuentas posibles, porque una norma de la que depende está pendiente de convalidación por el Congreso: ',
    );
    expect(all).toContain('Real Decreto-ley 29/2026');
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
      rentLetter(pendingRise, NO_DETAILS, tr),
    ]) {
      const all = text(model).toLowerCase();
      for (const forbidden of FORBIDDEN) expect(all).not.toMatch(forbidden);
    }
  });
});
