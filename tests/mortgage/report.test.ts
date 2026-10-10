import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { LEGAL_INTEREST } from '../../src/engine/law/data/legal-interest';
import { reviewMortgage } from '../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput } from '../../src/engine/mortgage/types';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { mortgageReport } from '../../src/mortgage/report';
import { DEPS, invoice, mortgage, READ_DEPS, TODAY } from '../engine/mortgage/input';

const tr: Translate = (key, vars) => t('es', key, vars);
const d = parseDate;

const report = (change: Partial<MortgageInput>, deps: MortgageDeps = DEPS): DocumentModel => {
  const input = mortgage(change);
  const r = reviewMortgage(input, TODAY, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return mortgageReport({ input, review: r.review }, LEGAL_INTEREST, tr, TODAY);
};

const plain = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

const rows = (model: DocumentModel) =>
  model.blocks
    .filter((b): b is Extract<Block, { type: 'row' }> => b.type === 'row')
    .map((b) => [b.label, plain(b.value)]);

const texts = (model: DocumentModel) =>
  model.blocks.flatMap((b) => ('text' in b ? [plain(b.text)] : []));

const between = (model: DocumentModel, heading: string): DocumentModel => {
  const all = model.blocks;
  const from = all.findIndex((b) => b.type === 'heading' && b.text === heading);
  const to = all.findIndex((b, i) => i > from && b.type === 'heading');
  return { ...model, blocks: all.slice(from, to === -1 ? undefined : to) };
};

// A deed of 14-12-2018 with every invoice paid on its day, once the Supreme Court rulings are read:
// the tax by law, the notary and the registry by the split, with legal interest from that day.
const SPLIT: Partial<MortgageInput> = {
  deedOn: d('2018-12-14'),
  loanAmount: 150_000,
  invoices: [
    invoice('notary_loan', 800, { paidOn: d('2018-12-14') }),
    invoice('registry_mortgage', 400, { paidOn: d('2018-12-14') }),
    invoice('ajd_loan', 1_500, { paidOn: d('2018-12-14') }),
  ],
  clauses: [{ label: 'irph', present: true }],
};

describe('the mortgage report', () => {
  const model = report(SPLIT, READ_DEPS);

  it('dates the report and gives the data the person confirmed', () => {
    expect(model.title).toBe('Revisión de los gastos y comisiones de tu hipoteca');
    expect(model.footer).toContain('9 de octubre de 2026');
    expect(texts(model)).toContain('eslojusto.es · 9 de octubre de 2026');
    expect(rows(model)).toEqual(
      expect.arrayContaining([
        ['Fecha de la escritura', '14-12-2018'],
        ['Capital del préstamo', '150.000,00 €'],
        ['La pediste como particular, para tu casa', 'Sí'],
        ['Tipo de interés', 'Variable'],
        ['Revisión del tipo', 'Cada 12 meses'],
        ['Cláusula de gastos en la escritura', 'La tiene'],
        ['Notaría del préstamo', '800,00 € · lo pagaste tú'],
        ['Impuesto del préstamo (AJD)', '1.500,00 € · lo pagaste tú'],
        ['Día del pago', '14-12-2018'],
        ['IRPH', 'Aparece en tu escritura'],
      ]),
    );
  });

  it('keeps the total by law and the one by the Supreme Court on lines of their own', () => {
    const summary = between(model, 'Resumen');
    expect(rows(summary)).toEqual([
      ['Por ley', '1.500,00 €'],
      ['Según el reparto del Tribunal Supremo', '800,00 €'],
      ['Interés legal hasta el 08-10-2026', expect.stringMatching(/ €$/)],
    ]);
    const all = texts(summary).join('\n');
    expect(all).toContain('Estas cifras no se suman');
    expect(all).toContain('hace falta que el banco lo acepte o que un juez anule');
    expect(all).not.toContain('2.300');
  });

  it('gives the legal interest of each split item year by year', () => {
    const expenses = between(model, 'Gasto por gasto');
    expect(texts(expenses)).toContain('Interés legal sobre la parte del banco, año por año:');
    const years = rows(expenses).filter(([label]) => /^\d{4}: /.test(label ?? ''));
    // 18 days of 2018, then each year up to 2026, for each of the two split items.
    const nine = [...Array(9).keys()].map((i) => String(2018 + i));
    expect(years.map(([label]) => label?.slice(0, 4))).toEqual([...nine, ...nine]);
    expect(years[0]).toEqual(['2018: 18 días al 3 %', expect.stringMatching(/ €$/)]);
    // The statute item carries no interest.
    const tax = texts(expenses).indexOf('Impuesto del préstamo (AJD)');
    expect(texts(expenses).slice(tax)).not.toContain(
      'Interés legal sobre la parte del banco, año por año:',
    );
  });

  it('dates the state of the case law in the flags and gives every source with its state', () => {
    expect(texts(between(model, 'Cláusulas de tu escritura'))).toContain(
      'Lo que dicen los tribunales · estado a 07-10-2026',
    );
    const sources = between(model, 'Las normas y criterios, y su estado').blocks.filter(
      (b) => b.type === 'source',
    );
    expect(sources.length).toBeGreaterThan(4);
    expect(sources.map((s) => ('text' in s ? s.text : ''))).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/art\. 29 .* · con efectos desde el .* · en vigor$/),
        expect.stringMatching(/C-125\/18.* · estado a \d\d-\d\d-\d{4}$/),
      ]),
    );
  });

  it('gives no figure for the split while its rulings are unread', () => {
    const summary = rows(between(report(SPLIT), 'Resumen'));
    expect(summary).toContainEqual([
      'Según el reparto del Tribunal Supremo',
      'Sin cifra por ahora',
    ]);
    expect(summary.some(([label]) => label?.startsWith('Interés legal'))).toBe(false);
  });

  it('gives the fees over their caps apart, with the lowest reading', () => {
    const fees = report({
      deedOn: d('2021-03-10'),
      operations: [
        {
          on: d('2022-03-01'),
          kind: 'partial_prepayment',
          principal: 20_000,
          feeCharged: 200,
          hadInsurance: null,
        },
      ],
    });
    expect(rows(between(fees, 'Resumen'))).toContainEqual([
      'Comisiones por encima del tope legal',
      '150,00 €',
    ]);
    expect(texts(between(fees, 'Resumen')).join('\n')).toContain('la más alta da 170,00 €');
    expect(rows(fees)).toContainEqual([
      'Amortización parcial',
      '01-03-2022: 20.000,00 € amortizados, 200,00 € de comisión',
    ]);
  });

  it('ends with what the review does not look at and where to find out for free', () => {
    const headings = model.blocks.flatMap((b) => (b.type === 'heading' ? [b.text] : []));
    expect(headings).toEqual([
      'Tus datos',
      'Resumen',
      'Gasto por gasto',
      'Cláusulas de tu escritura',
      'Las normas y criterios, y su estado',
      'Para que lo sepas',
      'Lo que esta revisión no mira',
      'Dónde informarte gratis',
    ]);
    expect(texts(between(model, 'Lo que esta revisión no mira'))).toContain(
      'Los plazos de tu caso',
    );
  });
});
