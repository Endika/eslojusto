import { describe, expect, it } from 'vitest';
import { parseDate as f, type CivilDate } from '../../src/engine/date';
import { MINIMUM_WAGE } from '../../src/engine/employment/data/minimum-wage';
import { LAW_QUOTES } from '../../src/engine/employment/quotes';
import { reviewEmployment, type EmploymentDeps } from '../../src/engine/employment/review';
import { INFO_ELEMENTS, type EmploymentInput } from '../../src/engine/employment/types';
import { formatEuros } from '../../src/calculator/number';
import { NO_DETAILS, type LetterDetails } from '../../src/documents/letter';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { employmentCase } from '../../src/employment/case';
import { employmentReport } from '../../src/employment/report';
import { headline } from '../../src/employment/summary';
import {
  certificateRequest,
  companyLetter,
  employmentLetterKinds,
  hasTemporalityFinding,
  missingInformation,
  payShortfall,
} from '../../src/employment/letters';
import type { CompletedEmploymentReview } from '../../src/employment/ports';
import type { Assessed } from '../../src/engine/employment/types';
import { finding } from '../engine/employment/input';
import {
  belowMinimum,
  contract,
  corners,
  malformed,
  shortDayRateDoubt,
  TABLES,
  TODAY,
  tr,
  workOrService,
  eachRow,
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

  it('with a shortfall in every reading, gives only the lowest and says so', () => {
    const r = completed(shortDayRateDoubt);
    expect(kindsOf(r).paid).toEqual(['employment']);
    const all = text(full(r));
    expect(all).toContain(
      'Mi salario pactado es de 55,00 € por jornada: 2,82 € menos por jornada.',
    );
    expect(all).toContain('Estas cifras son las más bajas de las cuentas posibles');
    expect(all).not.toContain('12,82');
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

  it('gives a short contract in force on 19-11-2026 ten working days and the decree-law', () => {
    const r = completed(
      contract({
        ...absentInfo('o'),
        modality: 'production',
        causeStated: true,
        circumstancesStated: true,
        startDate: f('2026-11-10'),
        endDate: f('2026-11-30'),
        signedOn: null,
      }),
    );
    const letter = text(companyLetter(r, 'information', TODAY, TABLES, NO_DETAILS, tr));
    expect(letter).toContain(
      'Según la disposición transitoria segunda del Real Decreto-ley 39/2026, de 17 de noviembre, puedo pedir por escrito',
    );
    expect(letter).toContain('10 días hábiles');
    expect(letter).not.toContain('30 días hábiles');
    expect(letter).not.toContain('transitoria única');
  });

  it('carries no figures nor points even when the review has them', () => {
    const r = completed({ ...belowMinimum, ...absentInfo('o') });
    expect(kindsOf(r)).toEqual({ paid: ['employment'], free: ['information_request'] });
    const free = text(companyLetter(r, 'information', TODAY, TABLES, details, tr));
    expect(free).not.toMatch(/€|salario mínimo|no coinciden/);
    // The letter the pass pays for has the request too.
    expect(text(full(r))).toContain('Convenio colectivo, con su código');
  });
});

describe('the request for the certificate of temporary contracts', () => {
  // Each case with the findings it is about, so a change in the engine shows here.
  const statusesOf = (r: CompletedEmploymentReview) =>
    r.review.items.flatMap((a) =>
      a.kind === 'single' ? [[a.finding.id, a.finding.status] as const] : [],
    );

  const production = (change: Partial<EmploymentInput>) =>
    contract({
      modality: 'production',
      causeStated: true,
      circumstancesStated: true,
      startDate: f('2026-01-12'),
      endDate: f('2026-05-31'),
      signedOn: null,
      ...change,
    });

  it.each<[string, EmploymentInput, readonly [string, string]]>([
    [
      'a fixed-term contract not in writing',
      production({ writtenContract: false }),
      ['written_form', 'missing_requirement'],
    ],
    [
      'contracts chained over 18 months in 24',
      corners[4] as EmploymentInput,
      ['chaining_18_in_24', 'becomes_permanent'],
    ],
  ])('is offered for %s', (_name, input, finding) => {
    const r = completed(input);
    expect(statusesOf(r)).toContainEqual(finding);
    expect(kindsOf(r).free).toContain('temporary_contracts_certificate');
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
    expect(hasTemporalityFinding(r)).toBe(false);
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

  it('are made only of blocks the PDF can draw', () => {
    for (const input of [...corners, { ...belowMinimum, ...absentInfo('o', 'e', 'q') }]) {
      const c = employmentCase(completed(input), TODAY, TABLES);
      for (const kind of [...c.letterKinds, ...(c.freeLetterKinds ?? [])])
        expect(malformed(c.letter(kind, details, tr).blocks)).toEqual([]);
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
    expect(c.filename?.('letter')).toBe('client.employment.letter.information.filename');
    expect(text(c.letter('temporary_contracts_certificate', NO_DETAILS, tr))).toContain(
      'Al servicio público de empleo',
    );
    expect(c.report(tr, TODAY)).toEqual(employmentReport(r, tr, TODAY));
    expect(c.letter('employment', NO_DETAILS, tr)).toEqual(
      companyLetter(r, 'full', TODAY, TABLES, NO_DETAILS, tr),
    );
    expect(c.letter('information_request', NO_DETAILS, tr)).toEqual(
      companyLetter(r, 'information', TODAY, TABLES, NO_DETAILS, tr),
    );
  });

  it('gives a review without findings neither the pass nor a letter', () => {
    const c = employmentCase(completed(contract()), TODAY, TABLES);
    expect(c).toMatchObject({ offer: false, letterKinds: [], freeLetterKinds: [] });
  });

  it('sells it quietly only when nothing is against the law', () => {
    const clear = contract({
      startDate: f('2026-01-01'),
      signedOn: null,
      schedule: null,
      info: Object.fromEntries('abcdefghijklmnopq'.split('').map((e) => [e, 'present'])) as never,
    });
    expect(headline(completed(clear).review)).toBe('nothing_found');
    expect(employmentCase(completed(clear), TODAY, TABLES).quiet).toBe(true);
    expect(employmentCase(completed(belowMinimum), TODAY, TABLES).quiet).toBe(false);
  });
});

describe('what the letters read of a review', () => {
  const withItems = (r: CompletedEmploymentReview, items: Assessed[]) => ({
    ...r,
    review: { ...r.review, items },
  });
  const pay = (status: 'below_minimum' | 'within_limit', id = 'smi_annual' as const) =>
    finding({ id, status });
  const readings = (...findings: ReturnType<typeof pay>[]) =>
    ({
      kind: 'readings',
      question: 'complement_kind',
      readings: findings.map((f) => ({ when: 'complement_fixed', finding: f })),
    }) as unknown as Assessed;
  const base = completed(belowMinimum);

  it('asks for no missing information of a review that has no duty', () => {
    const out = completed(contract({ relationship: 'sport' }));
    expect(out.review.informationDuty).toBeNull();
    expect(missingInformation(out.review)).toBeNull();
  });

  it('reads the pay shortfall of the points on the pay', () => {
    eachRow(
      [
        [
          'a point on the pay, below in its one reading',
          [{ kind: 'single', finding: pay('below_minimum') }],
          'single',
        ],
        [
          'a pay point beside another in a reading, below in both',
          [
            readings(
              pay('below_minimum'),
              finding({ id: 'trial_limits', status: 'below_minimum' }),
            ),
          ],
          'readings',
        ],
        [
          'a pay point within the limit in one reading',
          [readings(pay('below_minimum'), pay('within_limit'))],
          null,
        ],
      ],
      (_, items, kind) => {
        const shortfall = payShortfall(withItems(base, items as Assessed[]), TODAY, TABLES);
        expect(shortfall === null ? null : shortfall.lowest ? 'readings' : 'single').toBe(kind);
      },
    );
  });

  it('names no year that is within the minimum of the tables it is given', () => {
    const lower = MINIMUM_WAGE.map((r) => (r.year === 2026 ? { ...r, annual: 10000 } : r));
    expect(payShortfall(base, TODAY, { ...TABLES, minimumWage: lower })).toBeNull();
  });

  it('asks the company about a clause void, though nothing else is wrong', () => {
    const waiver = contract({
      startDate: f('2026-01-01'),
      signedOn: null,
      clauses: [
        {
          label: 'waiver',
          months: null,
          compensationStated: null,
          trainingDescribed: null,
          waivedRight: 'holidays',
          costsOnWorker: null,
          literal: { text: '' },
        },
      ],
    });
    expect(kindsOf(completed(waiver)).paid).toEqual(['employment']);
    expect(
      kindsOf(completed(contract({ startDate: f('2026-01-01'), signedOn: null }))).paid,
    ).toEqual([]);
  });

  it('offers the certificate only for a temporality finding that holds in every reading', () => {
    eachRow(
      [
        [
          'a point that holds in every reading',
          [
            readings(
              finding({ id: 'trial_limits', status: 'becomes_permanent' }),
              finding({ id: 'trial_limits', status: 'becomes_permanent' }),
            ),
          ],
          true,
        ],
        [
          'a point that holds in one reading only',
          [
            readings(
              finding({ id: 'trial_limits', status: 'becomes_permanent' }),
              finding({ id: 'trial_limits', status: 'within_limit' }),
            ),
          ],
          false,
        ],
        ['a point with no reading', [readings()], false],
      ],
      (_, items, offered) => {
        expect(hasTemporalityFinding(withItems(base, items as Assessed[]))).toBe(offered);
      },
    );
  });

  it('writes the identity typed without its spaces, and leaves it out when only spaces', () => {
    const letter = (id: string) =>
      text(companyLetter(base, 'full', TODAY, TABLES, { ...details, id }, tr));
    expect(letter('  00000000A  ')).toContain('00000000A');
    expect(letter('  00000000A  ')).not.toContain(' 00000000A ');
    expect(letter('   ')).not.toContain('DNI');
  });

  it('names a point with no norm without one', () => {
    const noSource = {
      kind: 'single',
      finding: finding({ id: 'trial_limits', status: 'over_legal_limit', sources: [] }),
    } as Assessed;
    const letter = companyLetter(withItems(base, [noSource]), 'full', TODAY, TABLES, details, tr);
    expect(letter.blocks).toContainEqual({
      type: 'bullet',
      text: tr('client.employment.letter.points.line', {
        punto: tr('client.employment.finding.trial_limits'),
        norma: '',
      }),
    });
  });

  it('asks only for the information owed in the letter that only asks for it', () => {
    const r = completed({ ...workOrService, ...absentInfo('o') });
    const only = text(companyLetter(r, 'information', TODAY, TABLES, details, tr));
    const all = text(full(r, details));
    expect(only).toContain(tr('client.employment.letter.information.title'));
    expect(only).not.toContain(tr('client.employment.letter.points.intro'));
    expect(all).toContain(tr('client.employment.letter.company.title'));
    expect(all).toContain(tr('client.employment.letter.points.intro'));
  });

  it('dates the contract in the letter to the company and names the law in the certificate', () => {
    const letter = text(companyLetter(base, 'full', TODAY, TABLES, details, tr));
    expect(letter).toContain('2026');
    expect(letter).not.toMatch(/[{}]/);
    expect(text(certificateRequest(TABLES, details, tr))).not.toMatch(/[{}]/);
  });
});
