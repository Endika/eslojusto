import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import { INFO_ELEMENTS, type EmploymentInput } from '../../src/engine/employment/types';
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

describe('the contract report', () => {
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
      /art\. 3\.1 \(Real Decreto 126\/2026, de 18 de febrero\) · con efectos del 20-02-2026 al 31-12-2026 · en vigor/,
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
