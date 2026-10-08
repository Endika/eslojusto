import { describe, expect, it } from 'vitest';
import { parseDate as f, type CivilDate } from '../../src/engine/date';
import { MINIMUM_WAGE } from '../../src/engine/employment/data/minimum-wage';
import type { MinimumWageTable } from '../../src/engine/employment/minimum-wage';
import { LAW_QUOTES } from '../../src/engine/employment/quotes';
import { reviewEmployment, type EmploymentDeps } from '../../src/engine/employment/review';
import { INFO_ELEMENTS, type EmploymentInput } from '../../src/engine/employment/types';
import { formatEuros } from '../../src/calculator/number';
import { NO_DETAILS, type LetterDetails, type LetterKind } from '../../src/documents/letter';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { employmentCase } from '../../src/employment/case';
import {
  certificateRequest,
  companyLetter,
  employmentLetterKinds,
  hasTemporalityFinding,
  missingInformation,
  payShortfall,
} from '../../src/employment/letters';
import type { CompletedEmploymentReview } from '../../src/employment/ports';
import { EMPLOYMENT_FORBIDDEN, FORBIDDEN } from '../support/forbidden';
import {
  belowMinimum,
  contract,
  corners,
  shortDayRate,
  TABLES,
  TODAY,
  tr,
  unknownComplement,
  workOrService,
} from './fixtures';

// A review read against the tables given, as the composition root loads them.
const completed = (
  input: EmploymentInput,
  today: CivilDate = TODAY,
  tables: EmploymentDeps = TABLES,
): CompletedEmploymentReview => {
  const r = reviewEmployment(input, today, tables);
  if (!r.ok) throw new Error(`invalid: ${JSON.stringify(r.errors)}`);
  return { review: r.review, input, detail: 'unlocked' };
};

// The figures' narrow spaces read as plain ones.
const text = (model: DocumentModel) =>
  model.blocks
    .map((b: Block) =>
      'text' in b
        ? b.text
        : 'label' in b
          ? `${b.label} ${'value' in b ? (b.value ?? '') : ''}`
          : '',
    )
    .join('\n')
    .replace(/[\u00a0\u202f]/g, ' ');

const kindsOf = (r: CompletedEmploymentReview, today: CivilDate = TODAY, tables = TABLES) =>
  employmentLetterKinds(r, today, tables);

const full = (r: CompletedEmploymentReview, details: LetterDetails = NO_DETAILS) =>
  companyLetter(r, 'full', TODAY, TABLES, details, tr);

const row2026 = (() => {
  const row = MINIMUM_WAGE.find((r) => r.year === 2026);
  if (row === undefined) throw new Error('No 2026 row in the minimum wage table');
  return row;
})();

// 1.000 € a month in 14 payments, from 01-06-2026: 14.000 € a year.
const lowPay = (change: Partial<EmploymentInput> = {}) =>
  contract({
    startDate: f('2026-06-01'),
    signedOn: null,
    salary: {
      amount: 1000,
      period: 'month',
      payments: 14,
      prorated: false,
      breakdown: [],
      inKind: null,
    },
    ...change,
  });

const absentInfo = (
  ...elements: (typeof INFO_ELEMENTS)[number][]
): Pick<EmploymentInput, 'info'> => ({
  info: Object.fromEntries(
    INFO_ELEMENTS.map((e) => [e, elements.includes(e) ? 'absent' : 'present']),
  ) as EmploymentInput['info'],
});

const details: LetterDetails = {
  ...NO_DETAILS,
  name: 'Alex Ejemplo',
  id: '00000000A',
  company: 'Talleres Ficticios SL',
  workplace: 'Calle Inventada 0, Villaficticia',
  place: 'Villaficticia',
  date: f('2026-10-08'),
};

describe('the salary block of the company letter', () => {
  it('comes with a shortfall in a published year, with the decree and its amount from the table', () => {
    const r = completed(belowMinimum);
    expect(kindsOf(r).paid).toEqual(['employment']);
    const all = text(full(r));
    expect(all).toContain(
      `En 2026, el Real Decreto 126/2026, de 18 de febrero, fija un mínimo anual de ${formatEuros(row2026.annual).replace(/\u00a0/g, ' ')} a jornada completa.`,
    );
    expect(all).toContain('Mi salario pactado es de 16.100,00 € al año: 994,00 € menos al año.');
    expect(all).toContain('Te pido que se revise mi salario.');
  });

  it('reads the decree’s amount from the table it is given, never a figure of its own', () => {
    const altered: MinimumWageTable = MINIMUM_WAGE.map((r) =>
      r.year === 2026 ? { ...r, annual: 18000 } : r,
    );
    const tables = { ...TABLES, minimumWage: altered };
    const r = completed(belowMinimum, TODAY, tables);
    const all = text(companyLetter(r, 'full', TODAY, tables, NO_DETAILS, tr));
    expect(all).toContain('fija un mínimo anual de 18.000,00 € a jornada completa');
    expect(all).not.toContain('17.094');
  });

  it('gives the minimum for the person’s working time beside the full-time one', () => {
    const r = completed(lowPay({ contractHours: { weekly: 20, annual: null } }));
    // 500 € a month in 14 payments is under half the 2026 minimum.
    const halfPay = completed(
      lowPay({
        contractHours: { weekly: 20, annual: null },
        salary: {
          amount: 500,
          period: 'month',
          payments: 14,
          prorated: false,
          breakdown: [],
          inKind: null,
        },
      }),
    );
    expect(payShortfall(r, TODAY, TABLES)).toBeNull();
    expect(text(full(halfPay))).toContain(
      'fija un mínimo anual de 17.094,00 € a jornada completa, que en proporción a mi jornada es de 8.547,00 €. Mi salario pactado es de 7.000,00 € al año: 1.547,00 € menos al año.',
    );
  });

  it('gives a short fixed-term contract its amount per working day', () => {
    expect(text(full(completed(shortDayRate)))).toContain(
      'fija un mínimo de 57,82 € por jornada legal para los contratos de hasta 120 días. Mi salario pactado es de 50,00 € por jornada: 7,82 € menos por jornada.',
    );
  });

  it('never comes for 2027 while its minimum is unpublished', () => {
    const in2027 = f('2027-03-01');
    const r = completed(lowPay({ startDate: f('2027-01-04') }), in2027);
    expect(payShortfall(r, in2027, TABLES)).toBeNull();
    expect(kindsOf(r, in2027).paid).toEqual([]);
    // Across the turn of the year, 2026 is named and 2027 is not.
    const across = completed(lowPay(), in2027);
    const shortfall = payShortfall(across, in2027, TABLES);
    expect(shortfall?.years.map((y) => y.year)).toEqual([2026]);
    const all = text(companyLetter(across, 'full', in2027, TABLES, NO_DETAILS, tr));
    expect(all).toContain('En 2026,');
    expect(all).not.toContain('2027');
  });

  it('names 2027 once its decree is in the table', () => {
    const in2027 = f('2027-03-01');
    const with2027: MinimumWageTable = [
      ...MINIMUM_WAGE,
      {
        ...row2026,
        year: 2027,
        publishedOn: '2027-01-20',
        effectsFrom: '2027-01-01',
        effectsUntil: '2027-12-31',
        annual: 17500,
      },
    ];
    const tables = { ...TABLES, minimumWage: with2027 };
    const r = completed(lowPay({ startDate: f('2027-01-04') }), in2027, tables);
    expect(payShortfall(r, in2027, tables)?.years.map((y) => y.year)).toEqual([2027]);
  });

  it('never comes when the shortfall depends on a «No lo sé»', () => {
    const r = completed(unknownComplement);
    expect(r.review.items[0]?.kind).toBe('readings');
    expect(payShortfall(r, TODAY, TABLES)).toBeNull();
    expect(text(full(r))).not.toContain('salario mínimo');
  });
});

describe('the points block of the company letter', () => {
  it('names each point that does not match the law with its norm, and only asks to review them', () => {
    const r = completed(workOrService);
    const all = text(full(r));
    expect(all).toContain(
      'Modalidad de contrato: Estatuto de los Trabajadores, art. 15.1, y disposiciones transitorias 3.ª y 4.ª',
    );
    expect(all).toContain('Te pido que se revisen.');
    expect(all).not.toMatch(/€/);
  });

  it('leaves out what the agreement may move and what depends on an answer', () => {
    // Three months of trial for a technician is within the law, over it otherwise: two readings.
    const r = completed(contract({ trial: { amount: 3, unit: 'months' }, technical: null }));
    expect(kindsOf(r).paid).toEqual([]);
    const production = completed(
      contract({
        modality: 'production',
        causeStated: true,
        circumstancesStated: true,
        startDate: f('2026-01-01'),
        endDate: f('2026-09-30'),
        signedOn: null,
      }),
    );
    expect(text(full(production))).not.toContain('Duración del contrato por producción');
  });
});

describe('the request for the information owed in writing', () => {
  it('is free and lists what is missing, the agreement and the category first', () => {
    const r = completed(contract(absentInfo('b', 'e', 'o')));
    expect(kindsOf(r)).toEqual({ paid: [], free: ['information_request'] });
    const letter = companyLetter(r, 'information', TODAY, TABLES, NO_DETAILS, tr);
    const bullets = letter.blocks.flatMap((b) => (b.type === 'bullet' ? [b.text] : []));
    expect(bullets).toEqual([
      'Convenio colectivo, con su código y su fecha de publicación',
      'Categoría o grupo profesional y descripción del puesto',
      'Fecha de inicio y, si es temporal, de fin o duración',
    ]);
    expect(text(letter)).toContain(
      'Según el Real Decreto 723/2026, de 9 de septiembre (art. 3 y disposición transitoria única), puedo pedir por escrito',
    );
  });

  it('says the information was due before starting for a contract from 05-10-2026', () => {
    const r = completed(
      contract({ ...absentInfo('o'), startDate: f('2026-10-06'), signedOn: null }),
    );
    expect(text(companyLetter(r, 'information', TODAY, TABLES, NO_DETAILS, tr))).toContain(
      '(arts. 3 y 7.1), esta información se da por escrito antes de empezar a trabajar',
    );
  });

  it('carries no figures nor points even when the review has them', () => {
    const r = completed({ ...belowMinimum, ...absentInfo('o') });
    expect(kindsOf(r)).toEqual({ paid: ['employment'], free: ['information_request'] });
    const free = text(companyLetter(r, 'information', TODAY, TABLES, details, tr));
    expect(free).not.toMatch(/€|salario mínimo|no coinciden/);
    // The letter the pass pays for has the request too.
    expect(text(full(r))).toContain('Convenio colectivo, con su código');
  });

  it('is not offered for an element only unknown, one owed only if used, or a short contract', () => {
    const unknown = contract({
      info: { ...absentInfo().info, o: 'unknown', k: 'absent' },
    });
    expect(missingInformation(completed(unknown).review)).toBeNull();
    const short = completed(
      contract({
        ...absentInfo('o'),
        modality: 'production',
        causeStated: true,
        circumstancesStated: true,
        startDate: f('2026-10-01'),
        endDate: f('2026-10-20'),
        signedOn: null,
      }),
    );
    expect(missingInformation(short.review)).toBeNull();
  });
});

describe('the request for the certificate of temporary contracts', () => {
  it('is offered only with a fixed-term finding on the modality or the chaining', () => {
    expect(kindsOf(completed(belowMinimum)).free).toEqual([]);
    expect(kindsOf(completed(contract())).free).toEqual([]);
    expect(kindsOf(completed(workOrService)).free).toEqual(['temporary_contracts_certificate']);
    for (const input of corners) {
      const r = completed(input);
      expect(kindsOf(r).free.includes('temporary_contracts_certificate')).toBe(
        hasTemporalityFinding(r.review),
      );
    }
  });

  it('is not offered when the finding depends on a «No lo sé»', () => {
    // Eight months now and two contracts before, one of them at a company of the same group that
    // bridges the other two: over 18 months in 24 only if the group counts.
    const r = completed(
      contract({
        modality: 'production',
        causeStated: true,
        circumstancesStated: true,
        startDate: f('2025-01-01'),
        endDate: f('2025-08-31'),
        signedOn: null,
        history: [
          {
            startDate: f('2024-01-01'),
            endDate: f('2024-08-31'),
            employer: 'same',
            kind: 'production',
          },
          {
            startDate: f('2024-08-15'),
            endDate: f('2025-01-15'),
            employer: 'same_group',
            kind: 'production',
          },
        ],
      }),
    );
    const chaining = r.review.items.find(
      (a) => a.kind === 'readings' && a.readings.some((x) => x.finding.item === 'chaining'),
    );
    expect(chaining).toBeDefined();
    expect(hasTemporalityFinding(r.review)).toBe(false);
    expect(kindsOf(r).free).toEqual([]);
  });

  it('is addressed to the public employment service with the words of art. 15.9 ET', () => {
    const letter = certificateRequest(TABLES, details, tr);
    const all = text(letter);
    expect(letter.blocks[1]).toEqual({ type: 'text', text: 'Al servicio público de empleo' });
    expect(all).toContain(`«${LAW_QUOTES.temporary_certificate.text}»`);
    expect(all).toContain('Estatuto de los Trabajadores, art. 15.9');
    expect(all).not.toMatch(/te escribo|te pido/i);
    expect(letter.blocks).toContainEqual(
      expect.objectContaining({ type: 'source', url: expect.stringContaining('#a15') }),
    );
  });
});

describe('the letters', () => {
  it('take the details typed, the DNI only when given, and end with a blank name line', () => {
    const r = completed(belowMinimum);
    const filled = full(r, details);
    expect(filled.blocks).toContainEqual({
      type: 'blank',
      label: 'Centro de trabajo',
      value: 'Calle Inventada 0, Villaficticia',
      wrap: true,
    });
    expect(filled.blocks).toContainEqual({
      type: 'blank',
      label: 'DNI o NIE',
      value: '00000000A',
      wrap: true,
    });
    expect(text(filled)).toContain('En Villaficticia, a 8 de octubre de 2026');
    expect(full(r).blocks.some((b) => b.type === 'blank' && b.label === 'DNI o NIE')).toBe(false);
    // The request to the public service always keeps the line.
    expect(certificateRequest(TABLES, NO_DETAILS, tr).blocks).toContainEqual({
      type: 'blank',
      label: 'DNI o NIE',
    });
    for (const model of [filled, certificateRequest(TABLES, details, tr)])
      expect(model.blocks.at(-1)).toEqual({
        type: 'blank',
        label: 'Nombre y apellidos',
        value: 'Alex Ejemplo',
        wrap: true,
      });
  });

  it('inform without advising, asserting or pressing', () => {
    const models: DocumentModel[] = [];
    for (const input of [...corners, { ...belowMinimum, ...absentInfo('o', 'e', 'q') }]) {
      const c = employmentCase(completed(input), TODAY, TABLES);
      const kinds: LetterKind[] = [...c.letterKinds, ...(c.freeLetterKinds ?? [])];
      for (const kind of kinds) models.push(c.letter(kind, details, tr));
    }
    expect(models.length).toBeGreaterThan(10);
    for (const model of models) {
      const all = text(model).toLowerCase();
      for (const forbidden of [...FORBIDDEN, ...EMPLOYMENT_FORBIDDEN])
        expect(all).not.toMatch(forbidden);
      expect(all).not.toMatch(
        /\bexijo\b|\breclamo\b|\bdemanda\b|\bfirma\b|denunciar|tribunal|juzgado/,
      );
    }
  });
});

describe('the contract review as the pass sees it', () => {
  it('offers the pass as the review does, the company letter for it and the free letters apart', () => {
    const r = completed({ ...workOrService, ...absentInfo('o') });
    const c = employmentCase(r, TODAY, TABLES);
    expect(c.offer).toBe(r.review.offerPass);
    expect(c.letterKinds).toEqual(['employment']);
    expect(c.freeLetterKinds).toEqual(['information_request', 'temporary_contracts_certificate']);
    expect(c.filename?.('report')).toBe('client.employment.report.filename');
    expect(c.filename?.('letter', 'employment')).toBe('client.employment.letter.company.filename');
    expect(c.filename?.('letter', 'information_request')).toBe(
      'client.employment.letter.information.filename',
    );
    expect(c.filename?.('letter', 'temporary_contracts_certificate')).toBe(
      'client.employment.letter.certificate.filename',
    );
    expect(text(c.letter('temporary_contracts_certificate', NO_DETAILS, tr))).toContain(
      'Al servicio público de empleo',
    );
  });

  it('gives a review without findings neither the pass nor a letter', () => {
    const c = employmentCase(completed(contract()), TODAY, TABLES);
    expect(c).toMatchObject({ offer: false, letterKinds: [], freeLetterKinds: [] });
  });
});
