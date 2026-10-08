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

  it('gives only the lower interest, up to the last day counted', () => {
    // 150 € from 31-07-2026 to 07-10-2026 and 850 € to 13-08-2026, at 3,25 %: 1,98 € on 365
    // days, 2,01 € on 360. The letter asks only for what holds in both.
    expect(all).toMatch(/Hasta el 07-10-2026, ese interés suma 1,98\s€\./);
    expect(all).toContain('Esta cifra es la más baja de las cuentas posibles.');
    expect(all).not.toMatch(/2,01|365|360/);
  });

  it('fills the account and the person’s details, and leaves no line to sign', () => {
    const model = depositLetter(r, TODAY, details, tr);
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

describe('the deposit letter, deposit back in full but late', () => {
  // Keys back 30-06-2025; the whole 1.000 € came back on 30-06-2026, eleven months late.
  const late = completed(
    contract({
      signedOn: f('2021-03-15'),
      startDate: f('2021-03-20'),
      moveOut: {
        keysReturnedOn: f('2025-06-30'),
        returns: [{ on: f('2026-06-30'), amount: 1000 }],
        deductions: [],
      },
    }),
  );

  it('is offered for the interest alone', () => {
    expect(rentalLetterKinds(late.review)).toEqual(['deposit_return']);
  });

  it('asks only for the interest of the delay, never for a deposit of 0 €', () => {
    const all = text(depositLetter(late, TODAY, details, tr));
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
