import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import {
  INFO_ELEMENTS,
  type EmploymentInput,
  type InfoElement,
  type InfoPresence,
  type Assessed,
} from '../../src/engine/employment/types';
import type { EmploymentReview } from '../../src/engine/employment/review';
import type { Translate } from '../../src/i18n/client';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { sans } from '../../src/documents/fonts/sans';
import { serif } from '../../src/documents/fonts/serif';
import { NO_DETAILS } from '../../src/documents/letter';
import { STYLES } from '../../src/documents/pdf';
import { PdfDocument } from '../../src/documents/pdf-writer';
import { employmentCase } from '../../src/employment/case';
import { employmentReport } from '../../src/employment/report';
import { EMPLOYMENT_FORBIDDEN, FORBIDDEN } from '../support/forbidden';
import {
  belowMinimum,
  contract,
  corners,
  malformed,
  review,
  shortDayRateDoubt,
  TABLES,
  TODAY,
  tr,
} from './fixtures';

const report = (input: EmploymentInput): DocumentModel =>
  employmentReport({ review: review(input), input, detail: 'unlocked' }, tr, TODAY);

const text = (blocks: readonly Block[]) =>
  blocks
    .map((b) =>
      'text' in b
        ? b.text
        : 'label' in b
          ? `${b.label} ${'value' in b ? (b.value ?? '') : ''}`
          : '',
    )
    .join('\n')
    .replace(/[\u00a0\u202f]/g, ' ');

// The corner with a production contract over its limits, its chaining, a trial period in doubt
// and a contract that ended before the information decree.
const production = corners[4] as EmploymentInput;
// The corner with clauses, payslips, an offer and the agreement's figures.
const clauses = corners[6] as EmploymentInput;

const dataRowsOf = (input: EmploymentInput) => {
  const blocks = report(input).blocks;
  const from = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Tus datos');
  return blocks
    .slice(from + 1)
    .flatMap((b) => (b.type === 'row' ? [[b.label, b.value.replace(/[\u00a0\u202f]/g, ' ')]] : []));
};

describe('the contract report', () => {
  it('gives the figures the contract leaves out as none, and leaves out the rows it has no figure for', () => {
    const bare = contract({
      contractHours: { weekly: null, annual: null },
      trial: null,
      holidays: null,
      history: null,
    });
    expect(dataRowsOf(bare)).toEqual([
      ['Fecha de inicio', '01-03-2024'],
      ['Fecha de fin', 'Sin fecha de fin'],
      ['Tipo de contrato', 'Indefinido'],
      ['Salario bruto', '1.500,00 € al mes'],
      ['Pagas al año', '14'],
      ['Horas a la semana', 'Sin dato'],
      ['Jornada completa de tu convenio', 'Sin dato'],
      ['Periodo de prueba', 'Sin dato'],
      ['Vacaciones', 'Sin dato'],
      ['Nóminas', '0'],
    ]);
    const full = contract({
      endDate: f('2026-12-31'),
      contractHours: { weekly: 37.5, annual: 1688.25 },
      fullTimeHours: 40,
      agreement: { ...contract().agreement, categoryAnnualSalary: 20000 },
      trial: { amount: 1, unit: 'months' },
      holidays: { days: 22, unit: 'working', workDaysPerWeek: 5, includedInSalary: false },
      payslips: [],
      history: [],
    });
    expect(dataRowsOf(full)).toEqual([
      ['Fecha de inicio', '01-03-2024'],
      ['Fecha de fin', '31-12-2026'],
      ['Tipo de contrato', 'Indefinido'],
      ['Salario bruto', '1.500,00 € al mes'],
      ['Pagas al año', '14'],
      ['Horas a la semana', '37,5'],
      ['Horas al año', '1688,25'],
      ['Jornada completa de tu convenio', '40'],
      ['Salario de tu categoría', '20.000,00 €'],
      ['Periodo de prueba', '1 mes'],
      ['Vacaciones', '22 días laborables'],
      ['Nóminas', '0'],
      ['Contratos en tu vida laboral', '0'],
    ]);
  });

  it('gives the data the person confirmed', () => {
    const model = report(production);
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Fecha de inicio',
      value: '08-01-2024',
    });
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Fecha de fin',
      value: '20-02-2025',
    });
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Tipo de contrato',
      value: 'Por circunstancias de la producción',
    });
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Periodo de prueba',
      value: '3 meses',
    });
    expect(text(model.blocks)).toContain('Salario bruto 1.500,00 € al mes');
  });

  it('gives each point with its exact figures, its calculation and its norms with their state', () => {
    const all = text(report(belowMinimum).blocks);
    expect(all).toContain('Salario frente al SMI');
    expect(all).toContain('Por debajo del SMI: 994,00 € al año');
    expect(all).toContain('Cómo se calcula');
    expect(all).toMatch(/2026: SMI de 17\.094,00 €/);
    expect(all).toMatch(
      /art\. 3\.1 \(Real Decreto 126\/2026, de 18 de febrero\) · con efectos del 01-01-2026 al 31-12-2026\n/,
    );
  });

  it('gives every reading of a «No lo sé» and the law’s words on fixed-term contracts', () => {
    const all = text(report(production).blocks);
    expect(all).toContain('Depende de si eres técnico titulado y del tamaño de tu empresa:');
    expect(all).toContain('Si no lo eres y tu empresa tiene 25 o más: depende de tu convenio');
    expect(all).toContain(
      'El artículo 15.5 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija:',
    );
  });

  it('counts the lower shortfall of two readings and bounds it with the higher', () => {
    const all = text(report(shortDayRateDoubt).blocks);
    expect(all).toContain(
      'Por debajo del SMI: 2,82 € por jornada, y hasta 12,82 € según tu respuesta',
    );
    expect(all).toContain('Si cuentan todos los complementos: por debajo del SMI en 2,82 €');
  });

  it('lists every element of the information the company owes in writing', () => {
    const missing = contract({
      info: Object.fromEntries(
        INFO_ELEMENTS.map((e) => [e, e === 'o' ? 'absent' : 'present']),
      ) as EmploymentInput['info'],
    });
    const model = report(missing);
    const all = text(model.blocks);
    expect(all).toContain('Información obligatoria por escrito');
    expect(all).toContain(
      'puedes pedir esta información por escrito y la empresa tiene 30 días hábiles',
    );
    const elements = model.blocks.filter(
      (b) => b.type === 'subheading' && /^(Convenio colectivo|Quiénes son las partes)/.test(b.text),
    );
    expect(elements).toHaveLength(2);
    expect(all).toContain('Falta lo que exige la ley');
    expect(all).toContain('Solo para contratos por ETT');
  });

  it('gives the reference figures only «si un juzgado lo declarase así», the offer and what is left out', () => {
    const withReference = text(report(production).blocks);
    expect(withReference).toContain('Si un juzgado lo declarase así');
    expect(withReference).toContain('Despido improcedente (art. 56): 2.215,07 €.');
    expect(text(report(contract()).blocks)).not.toContain('Si un juzgado');
    const withOffer = text(report(clauses).blocks);
    expect(withOffer).toContain('La oferta frente al contrato');
    expect(withOffer).toContain('Solo se ponen lado a lado');
    expect(withOffer).toContain('Lo que esta revisión no comprueba');
    expect(withOffer).toContain('La igualdad retributiva.');
    expect(withOffer).not.toContain('Las horas que trabajas de verdad.');
  });

  it('is dated the day it is made', () => {
    const model = employmentReport(
      { review: review(belowMinimum), input: belowMinimum, detail: 'unlocked' },
      tr,
      f('2026-10-09'),
    );
    expect(model.blocks[1]).toEqual({ type: 'meta', text: 'eslojusto.es · 9 de octubre de 2026' });
    expect(model.footer).toContain('9 de octubre de 2026');
  });

  it('says why a relationship is out of the review', () => {
    const all = text(report(contract({ relationship: 'sport' })).blocks);
    expect(all).toContain('Esta revisión no cubre tu tipo de contrato');
    expect(all).not.toContain('Punto por punto');
  });

  it('builds only blocks the PDF can draw', () => {
    for (const input of [...corners, shortDayRateDoubt, contract()])
      expect(malformed(report(input).blocks)).toEqual([]);
  });

  it('informs without advising or asserting', () => {
    for (const input of corners) {
      const all = text(report(input).blocks).toLowerCase();
      for (const forbidden of [...FORBIDDEN, ...EMPLOYMENT_FORBIDDEN])
        expect(all).not.toMatch(forbidden);
    }
  });
});

describe('the contract documents', () => {
  it('use only characters both fonts can draw', () => {
    // The writer turns these spaces into plain ones.
    const substituted = new Set(['\u00a0', '\u202f', '\u2009']);
    const missing = new Set<string>();
    for (const input of corners) {
      const r = { review: review(input), input, detail: 'unlocked' as const };
      const c = employmentCase(r, TODAY, TABLES);
      const models = [
        c.report(tr, TODAY),
        ...[...c.letterKinds, ...(c.freeLetterKinds ?? []), 'information_request' as const].map(
          (kind) => c.letter(kind, NO_DETAILS, tr),
        ),
      ];
      for (const model of models)
        for (const ch of text(model.blocks)) {
          const code = String(ch.codePointAt(0));
          if (ch !== '\n' && !substituted.has(ch) && !(code in sans.glyphs && code in serif.glyphs))
            missing.add(ch);
        }
    }
    expect([...missing]).toEqual([]);
  });

  // A row puts its value on the right and wraps its label in what is left: the value, and the
  // longest word of the label beside it, must fit the page.
  it('never have a row wider than the page', () => {
    const doc = new PdfDocument({ sans, serif }, 'x');
    const longest = contract({
      modality: 'replacement_selection',
      salary: {
        amount: 123456.78,
        period: 'year',
        payments: 14,
        prorated: false,
        breakdown: [],
        inKind: null,
      },
      contractHours: { weekly: 37.5, annual: 1688.25 },
      fullTimeHours: 37.5,
      agreement: {
        named: true,
        name: null,
        code: null,
        categoryAnnualSalary: 123456.78,
        annualHours: 1700,
        holidayDays: null,
        trialMonths: null,
      },
      holidays: { days: 22, unit: 'working', workDaysPerWeek: 5, includedInSalary: false },
      history: [],
    });
    for (const input of [...corners, longest]) {
      for (const b of report(input).blocks) {
        if (b.type !== 'row') continue;
        const word = Math.max(...b.label.split(' ').map((w) => doc.measure(w, STYLES.row)));
        expect(
          doc.measure(b.value, STYLES.row) + 16 + word,
          `${b.label}: ${b.value}`,
        ).toBeLessThanOrEqual(doc.width);
      }
    }
  });
});

// Each block of the report worded by its dictionary key, so these say what the report is made of
// and in which order, not how Spanish words it.
const echo: Translate = (key, vars) =>
  vars
    ? `${key}(${Object.entries(vars)
        .map(([k, v]) => `${k}=${v}`)
        .join(',')})`
    : key;
const P = 'client.employment.';

const lineOf = (b: Block): string => {
  const line =
    b.type === 'row'
      ? `row: ${b.label} = ${b.value}`
      : b.type === 'source'
        ? `source: ${b.text.split(' · ')[0]}`
        : 'text' in b
          ? `${b.type}: ${b.text}`
          : b.type;
  return line.replace(/[\u00a0\u202f]/g, ' ');
};

// From a line to the next heading, or to `end`.
const section = (
  input: EmploymentInput,
  start: string,
  end?: string,
  change: Partial<EmploymentReview> = {},
): string[] => {
  const lines = employmentReport(
    { review: { ...review(input), ...change }, input, detail: 'unlocked' },
    echo,
    TODAY,
  ).blocks.map(lineOf);
  const from = lines.indexOf(start);
  const to =
    end === undefined
      ? lines.findIndex((l, i) => i > from && /^(sub)?heading:/.test(l))
      : lines.indexOf(end, from + 1);
  return lines.slice(from, to < 0 ? undefined : to);
};

const allPresent = (change: Partial<Record<InfoElement, InfoPresence>>) =>
  Object.fromEntries(
    INFO_ELEMENTS.map((e) => [e, change[e] ?? 'present']),
  ) as EmploymentInput['info'];
const selection = contract({
  modality: 'replacement_selection',
  startDate: f('2026-01-01'),
  endDate: f('2026-02-15'),
  signedOn: null,
  replacedPersonNamed: true,
  replacementCauseStated: true,
});
const missing = contract({ info: allPresent({ o: 'absent' }) });
const unknownInfo = contract({ info: allPresent({ o: 'unknown' }) });
const notStarted = contract({ startDate: f('2026-12-01'), signedOn: null });
const driftingStart = contract({
  modality: 'work_or_service',
  startDate: f('2023-05-07'),
  signedOn: null,
});
const partialWithWarning = contract({
  startDate: f('2020-01-01'),
  signedOn: null,
  salary: {
    amount: 1500,
    period: 'month',
    payments: 14,
    prorated: false,
    breakdown: [{ kind: 'base', amount: 1000 }],
    inKind: null,
  },
});
const longProduction = contract({
  modality: 'production',
  startDate: f('2026-01-01'),
  endDate: f('2026-09-30'),
  signedOn: null,
  causeStated: true,
  circumstancesStated: true,
});
const offerOf = (offer: Partial<NonNullable<EmploymentInput['offer']>>) =>
  contract({
    offer: {
      grossAnnual: 21000,
      net: false,
      weeklyHours: 40,
      modality: 'permanent',
      remote: null,
      ...offer,
    },
  });
const sport = contract({ relationship: 'sport' });
const corner = (i: number) => corners[i] as EmploymentInput;

describe('the contract report, block by block', () => {
  it('a point below the minimum gives its status, since when, how it is worked out and its norms', () => {
    expect(section(belowMinimum, `subheading: ${P}finding.smi_annual`)).toEqual([
      'subheading: client.employment.finding.smi_annual',
      'text: client.employment.status.below_minimum_year(importe=994,00 €)',
      'note: client.employment.since_year(anio=2026,importe=765,24 €)',
      'note: client.employment.report.how',
      'bullet: client.employment.calculation.minimum_wage.pay.month(monthly=1.150,00 €,payments=14,annual=16.100,00 €)',
      'bullet: client.employment.calculation.minimum_wage.year.below(year=2026,minimum=17.094,00 €,pay=16.100,00 €,difference=994,00 €,days=client.employment.unit.day_many(n=281),accrued=765,24 €)',
      'bullet: client.employment.calculation.minimum_wage.agreement_may_pay_more()',
      'source: Estatuto de los Trabajadores, art. 27.1 (Real Decreto Legislativo 2/2015, de 23 de octubre)',
      'source: art. 3.1 (Real Decreto 126/2026, de 18 de febrero)',
    ]);
  });

  it('a point with no calculation says its status as its calculation', () => {
    expect(section(belowMinimum, `subheading: ${P}finding.smi_monthly`)).toEqual([
      'subheading: client.employment.finding.smi_monthly',
      'text: client.employment.status.not_entered',
      'note: client.employment.report.how',
      'bullet: client.employment.status.not_entered',
    ]);
  });

  it('a point that rests on the person’s answer says so before how it is worked out', () => {
    expect(section(belowMinimum, `subheading: ${P}finding.trial_limits`)).toEqual([
      'subheading: client.employment.finding.trial_limits',
      'text: client.employment.status.within_limit',
      'note: client.employment.note.your_answer',
      'note: client.employment.report.how',
      'bullet: client.employment.calculation.trial.within_legal_limit(trial=client.employment.calculation.trial.amount_months(amount=client.employment.unit.month_many(n=2)),months=client.employment.unit.month_many(n=2))',
      'source: Estatuto de los Trabajadores, art. 14.1 (Real Decreto Legislativo 2/2015, de 23 de octubre)',
    ]);
  });

  it('a point with two readings gives its range, its question, each reading, and each worked out', () => {
    expect(section(shortDayRateDoubt, `subheading: ${P}finding.smi_temporary_120`)).toEqual([
      'subheading: client.employment.finding.smi_temporary_120',
      'text: client.employment.status.below_minimum_day_up_to(importe=2,82 €,maximo=12,82 €)',
      'text: client.employment.question.complement_kind',
      'bullet: client.employment.reading_line(cuando=client.employment.reading.complement_fixed,resultado=client.employment.reading_status.below_minimum_day(importe=2,82 €))',
      'bullet: client.employment.reading_line(cuando=client.employment.reading.complement_variable,resultado=client.employment.reading_status.below_minimum_day(importe=12,82 €))',
      'note: client.employment.note.your_answer',
      'note: client.employment.report.how',
      'text: client.employment.reading.complement_fixed',
      'bullet: client.employment.calculation.minimum_wage.temporary.below(year=2026,minimum=57,82 €,pay=55,00 €,difference=2,82 €)',
      'bullet: client.employment.calculation.minimum_wage.agreement_may_pay_more()',
      'text: client.employment.reading.complement_variable',
      'bullet: client.employment.calculation.minimum_wage.excluded(excluded=10,00 €)',
      'bullet: client.employment.calculation.minimum_wage.temporary.below(year=2026,minimum=57,82 €,pay=45,00 €,difference=12,82 €)',
      'bullet: client.employment.calculation.minimum_wage.agreement_may_pay_more()',
      'source: Estatuto de los Trabajadores, art. 27.1 (Real Decreto Legislativo 2/2015, de 23 de octubre)',
      'source: art. 4.1 (Real Decreto 126/2026, de 18 de febrero)',
    ]);
  });

  it('a point the agreement may move says so', () => {
    expect(section(selection, `subheading: ${P}finding.replacement_selection_3_months`)).toEqual([
      'subheading: client.employment.finding.replacement_selection_3_months',
      'text: client.employment.status.within_limit',
      'note: client.employment.note.agreement',
      'note: client.employment.report.how',
      'bullet: client.employment.calculation.modality.duration(meses=1,dias=15,duracion=client.employment.and(a=client.employment.unit.month_one(n=1),b=client.employment.unit.day_many(n=15)))',
      'bullet: client.employment.calculation.modality.selection_within()',
      'source: Estatuto de los Trabajadores, art. 15.3 (Real Decreto Legislativo 2/2015, de 23 de octubre)',
    ]);
  });

  it('a clause gives the person’s words, then its readings', () => {
    expect(section(corner(6), `subheading: ${P}clause.non_compete`)).toEqual([
      'subheading: client.employment.clause.non_compete',
      'text: «Cláusula de ficción.»',
      'text: client.employment.status.depends',
      'text: client.employment.question.technical_post',
      'bullet: client.employment.reading_line(cuando=client.employment.reading.technical_post,resultado=client.employment.reading_status.review_it)',
      'bullet: client.employment.reading_line(cuando=client.employment.reading.not_technical_post,resultado=client.employment.reading_status.over_legal_limit)',
      'note: client.employment.note.your_answer',
      'note: client.employment.report.how',
      'text: client.employment.reading.technical_post',
      'bullet: client.employment.calculation.clauses.non_compete_compensation_unknown()',
      'text: client.employment.reading.not_technical_post',
      'bullet: client.employment.calculation.clauses.non_compete_months(months=client.employment.unit.month_many(n=12),cap=client.employment.unit.month_many(n=6))',
      'source: Estatuto de los Trabajadores, art. 21.2 (Real Decreto Legislativo 2/2015, de 23 de octubre)',
    ]);
  });

  it('a clause that is not assessed says so', () => {
    expect(section(corner(6), `subheading: ${P}clause.other`, `heading: ${P}duty.title`)).toEqual([
      'subheading: client.employment.clause.other',
      'text: client.employment.clause_not_assessed',
    ]);
  });

  it('the duty to inform lists each element, with nothing to ask for when all is in hand', () => {
    expect(section(corner(6), `heading: ${P}duty.title`, `subheading: ${P}info.b`)).toEqual([
      'heading: client.employment.duty.title',
      'subheading: client.employment.info.o',
      'text: client.employment.status.within_limit',
      'bullet: client.employment.calculation.information.present()',
      'subheading: client.employment.info.e',
      'text: client.employment.status.within_limit',
      'bullet: client.employment.calculation.information.present()',
      'subheading: client.employment.info.a',
      'text: client.employment.status.within_limit',
      'bullet: client.employment.calculation.information.present()',
    ]);
  });

  it('an element that does not apply says why, and nothing more', () => {
    expect(section(corner(6), `subheading: ${P}info.j`, `subheading: ${P}info.k`)).toEqual([
      `subheading: ${P}info.j`,
      `text: ${P}duty.temp_agency_only`,
    ]);
  });

  it('a point that depends on the agreement says so in its status, not in a note', () => {
    expect(section(longProduction, `subheading: ${P}finding.production_1_year`)).toEqual([
      `subheading: ${P}finding.production_1_year`,
      `text: ${P}status.depends_on_agreement`,
      `note: ${P}report.how`,
      `bullet: ${P}calculation.modality.duration(meses=9,dias=0,duracion=${P}unit.month_many(n=9))`,
      `bullet: ${P}calculation.modality.production_agreement_year()`,
      'source: Estatuto de los Trabajadores, art. 15.2 (Real Decreto Legislativo 2/2015, de 23 de octubre)',
    ]);
  });

  it('the duty to inform ends with its norm', () => {
    expect(section(corner(6), `subheading: ${P}info.q`, `heading: ${P}offer.title`)).toEqual([
      'subheading: client.employment.info.q',
      'text: client.employment.status.within_limit',
      'bullet: client.employment.calculation.information.present()',
      'source: art. 3.2 (Real Decreto 723/2026, de 9 de septiembre)',
    ]);
  });

  it('a contract that ended before the decree is given the reason and its norm', () => {
    expect(section(corner(5), `heading: ${P}duty.title`)).toEqual([
      'heading: client.employment.duty.title',
      'text: client.employment.duty.ended_before_decree',
      'source: disposición transitoria única (Real Decreto 723/2026, de 9 de septiembre)',
    ]);
  });

  it('the duty to inform says what may be asked for when an element is missing', () => {
    expect(section(missing, `heading: ${P}duty.title`, `subheading: ${P}info.a`)).toEqual([
      'heading: client.employment.duty.title',
      'text: client.employment.duty.on_request',
      'subheading: client.employment.info.o',
      'text: client.employment.status.missing_requirement',
      'bullet: client.employment.calculation.information.missing_on_request()',
      'subheading: client.employment.info.e',
      'text: client.employment.status.within_limit',
      'bullet: client.employment.calculation.information.present()',
    ]);
  });

  it('the duty to inform says what may be asked for when an element is to review', () => {
    expect(section(unknownInfo, `heading: ${P}duty.title`, `subheading: ${P}info.e`)).toEqual([
      'heading: client.employment.duty.title',
      'text: client.employment.duty.on_request',
      'subheading: client.employment.info.o',
      'text: client.employment.status.review_it',
      'bullet: client.employment.calculation.information.unknown()',
      'bullet: client.employment.calculation.information.missing_on_request()',
    ]);
  });

  it('a contract not yet started is told what the company owes it before it does', () => {
    expect(section(notStarted, `heading: ${P}duty.title`, `subheading: ${P}info.o`)).toEqual([
      'heading: client.employment.duty.title',
      'text: client.employment.duty.before_start',
    ]);
  });

  it('the reference figures come with their norms', () => {
    expect(section(corner(2), `heading: ${P}reference.title`)).toEqual([
      'heading: client.employment.reference.title',
      'text: client.employment.reference.lead(fecha=08-10-2026)',
      'bullet: client.employment.reference.fixed_term_end(importe=2.375,77 €)',
      'bullet: client.employment.reference.unfair_dismissal(importe=6.645,21 €)',
      'source: Estatuto de los Trabajadores, art. 49.1.c',
      'source: Estatuto de los Trabajadores, disposición transitoria 8.ª',
      'source: CGPJ, guía práctica para el cálculo de indemnizaciones (v0.6)',
      'source: Estatuto de los Trabajadores, art. 56',
      'source: Estatuto de los Trabajadores, disposición transitoria 11.ª',
    ]);
  });

  it('a reference figure the calculator may drift on is given as a range', () => {
    expect(section(driftingStart, `heading: ${P}reference.title`)).toEqual([
      'heading: client.employment.reference.title',
      'text: client.employment.reference.lead(fecha=08-10-2026)',
      'bullet: client.employment.reference.fixed_term_end(importe=2.366,31 €)',
      'bullet: client.employment.reference.unfair_dismissal_range(minimo=6.486,99 €,maximo=6.645,21 €)',
      'source: Estatuto de los Trabajadores, art. 49.1.c',
      'source: Estatuto de los Trabajadores, disposición transitoria 8.ª',
      'source: CGPJ, guía práctica para el cálculo de indemnizaciones (v0.6)',
      'source: Estatuto de los Trabajadores, art. 56',
      'source: Estatuto de los Trabajadores, disposición transitoria 11.ª',
    ]);
  });

  it('the offer is given as differences, with what could not be compared', () => {
    expect(
      section(corner(6), `heading: ${P}offer.title`, `heading: ${P}report.information`),
    ).toEqual([
      'heading: client.employment.offer.title',
      'text: client.employment.offer.count_many(n=3)',
      'note: client.employment.offer.no_verdict',
      'bullet: client.employment.offer.difference.weekly_hours(oferta=10,contrato=8)',
      'bullet: client.employment.offer.difference.modality(oferta=client.employment.modality.production,contrato=client.employment.modality.permanent)',
      'bullet: client.employment.offer.difference.remote(oferta=client.employment.remote.full,contrato=client.employment.remote.hybrid)',
      'bullet: client.employment.offer.not_compared.not_known(dato=client.employment.offer.field.gross_annual)',
    ]);
  });

  it('the information blocks give their words, their links and their norms', () => {
    expect(section(corner(6), `subheading: ${P}block.agreement`)).toEqual([
      'subheading: client.employment.block.agreement',
      'text: client.employment.calculation.information.agreement.named()',
      'text: client.employment.calculation.information.agreement.where()',
      'text: client.employment.calculation.information.agreement.sector_salary_amount_priority()',
      'source: client.employment.link.regcon',
      'source: Estatuto de los Trabajadores, art. 82.3 (Real Decreto Legislativo 2/2015, de 23 de octubre)',
    ]);
  });

  it('a block with two norms gives both', () => {
    expect(section(corner(6), `subheading: ${P}block.time_record`)).toEqual([
      'subheading: client.employment.block.time_record',
      'text: client.employment.calculation.working_time.time_record()',
      'text: client.employment.calculation.part_time.monthly_summary()',
      'source: Estatuto de los Trabajadores, art. 34.9 (Real Decreto-ley 8/2019, de 8 de marzo)',
      'source: Estatuto de los Trabajadores, art. 12.4.c (Real Decreto Legislativo 2/2015, de 23 de octubre)',
    ]);
  });

  it('what is not checked closes the report', () => {
    expect(section(corner(6), `heading: ${P}report.unchecked`)).toEqual([
      'heading: client.employment.report.unchecked',
      'bullet: client.employment.unchecked.agreement_tables',
      'bullet: client.employment.unchecked.bonuses',
      'bullet: client.employment.unchecked.equal_pay',
      'bullet: client.employment.unchecked.contributions',
      'bullet: client.employment.unchecked.net_pay',
      'bullet: client.employment.unchecked.later_agreements',
    ]);
  });

  it('a contract before the reform says the review is partial, and its warnings', () => {
    expect(
      section(
        partialWithWarning,
        `heading: ${P}report.summary`,
        `subheading: ${P}finding.smi_annual`,
      ),
    ).toEqual([
      'heading: client.employment.report.summary',
      'note: client.employment.partial.notice',
      'text: client.employment.headline.to_review',
      'bullet: client.employment.warning.breakdown_short_of_total',
      'heading: client.employment.report.points',
    ]);
  });

  it('a relationship out of the review has no points', () => {
    expect(
      section(sport, `heading: ${P}report.summary`, `heading: ${P}report.information`),
    ).toEqual([
      'heading: client.employment.report.summary',
      'text: client.employment.out_of_scope.status',
      'text: client.employment.out_of_scope.special_relationship',
    ]);
  });

  it.each([
    ['nothing differs', {}, [`text: ${P}offer.none`]],
    [
      'one thing differs',
      { grossAnnual: 24000 },
      [
        `text: ${P}offer.count_one(n=1)`,
        `note: ${P}offer.no_verdict`,
        `bullet: ${P}offer.difference.gross_annual(oferta=24.000 €,contrato=21.000 €)`,
      ],
    ],
  ])('the offer, when %s, is said so', (_, offer, expected) => {
    const lines = section(offerOf(offer), `heading: ${P}offer.title`);
    expect(lines.slice(1, 1 + expected.length)).toEqual(expected);
  });

  it.each([
    ['without points when there is nothing to point at', { items: [], clauses: [] }, false],
    ['with points when there are only items', { clauses: [] }, true],
    ['with points when there are only clauses', { items: [] }, true],
  ])('the report goes %s', (_, change, points) => {
    const lines = section(
      corner(6),
      `heading: ${P}report.summary`,
      `heading: ${P}duty.title`,
      change,
    );
    expect(lines.includes(`heading: ${P}report.points`)).toBe(points);
  });

  it('gives no heading to information blocks there are none of', () => {
    const lines = section(corner(6), `heading: ${P}duty.title`, `heading: ${P}report.unchecked`, {
      information: [],
    });
    expect(lines).not.toContain(`heading: ${P}report.information`);
  });

  it('says the agreement may set another when only one of the readings may', () => {
    const readings = review(shortDayRateDoubt).items.flatMap((a) =>
      a.kind === 'readings' ? [a] : [],
    );
    const [first, second] = readings[0]?.readings ?? [];
    const mixed = {
      ...readings[0],
      readings: [{ ...first, finding: { ...first?.finding, agreementMaySetOther: true } }, second],
    } as Assessed;
    const lines = section(
      shortDayRateDoubt,
      `subheading: ${P}finding.smi_temporary_120`,
      `subheading: ${P}finding.smi_monthly`,
      { items: [mixed] },
    );
    expect(lines).toContain(`note: ${P}note.agreement`);
  });
});
