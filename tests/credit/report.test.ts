import { describe, expect, it } from 'vitest';
import { BE1904 } from '../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../src/engine/credit/data/sources';
import { reviewCredit } from '../../src/engine/credit/review';
import type { CreditInput } from '../../src/engine/credit/types';
import type { CompletedCreditReview } from '../../src/credit/ports';
import { creditReport } from '../../src/credit/report';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { loan, repayment, TODAY } from '../engine/credit/input';

const tr: Translate = (key, vars) => t('es', key, vars);

const DEPS = {
  norms: CREDIT_NORMS,
  sources: CREDIT_SOURCES,
  rates: {
    'BE_19_4.7': BE1904['BE_19_4.7'],
    'BE_19_4.9': BE1904['BE_19_4.9'],
    'BE_19_4.10': BE1904['BE_19_4.10'],
    'BE_19_4.11': BE1904['BE_19_4.11'],
  },
};

const report = (input: CreditInput): DocumentModel => {
  const r = reviewCredit(input, TODAY, DEPS);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  const completed: CompletedCreditReview = { input, review: r.review };
  return creditReport(completed, tr, TODAY);
};

const rows = (model: DocumentModel) =>
  model.blocks
    .filter((b): b is Extract<Block, { type: 'row' }> => b.type === 'row')
    .map((b) => [b.label, b.value.replace(/[\u00a0\u202f]/g, ' ')]);

const texts = (model: DocumentModel) =>
  model.blocks.flatMap((b) => ('text' in b ? [b.text.replace(/[\u00a0\u202f]/g, ' ')] : []));

describe('the credit report', () => {
  // The STS 366/2026 loan: 10.500 €, 761,25 € of charges taken off, 48 × 273,35 €.
  const model = report(loan());

  it('dates the report and gives the data the person confirmed', () => {
    expect(model.title).toBe('Revisión de tu préstamo o tu tarjeta');
    expect(model.footer).toContain('9 de octubre de 2026');
    expect(rows(model)).toEqual(
      expect.arrayContaining([
        ['Cuando lo contrataste', '15-02-2019'],
        ['Importe del préstamo', '10.500,00 €'],
        ['Lo que recibiste', '9.738,75 €'],
        ['TAE que dice tu contrato', '12,00 %'],
        ['Cuotas', '48 cuotas de 273,35 €, la primera el 15-03-2019'],
        ['Comisión de apertura', '761,25 €, descontados de lo que recibiste'],
      ]),
    );
  });

  it('lays out the flows the APR is solved on, step by step, and what each charge adds', () => {
    expect(rows(model)).toEqual(
      expect.arrayContaining([
        ['15-02-2019 (t = 0,0000)', '9.738,75 €'],
        ['15-03-2019 (t = 0,0833)', '-273,35 €'],
        ['15-02-2023 (t = 4,0000)', '-273,35 €'],
      ]),
    );
    expect(rows(model).filter(([label]) => label?.includes('(t = '))).toHaveLength(49);
    const all = texts(model).join('\n');
    expect(all).toContain('cada mes cuenta como un doceavo de año');
    expect(all).toContain('sumen cero: 16,61 %');
    expect(all).toContain('La comisión de apertura añade 4,6');
  });

  it('keeps the indicator whole, as a court criterion with its source, never as a verdict', () => {
    const all = texts(model).join('\n');
    expect(all).toContain('Tu TAE frente al tipo medio del Banco de España');
    expect(all).toContain('un juez valora además las circunstancias del caso');
    expect(all).not.toMatch(/es usura|a recuperar/i);
  });

  it('sums what was charged over a cap only when every reading counts it', () => {
    expect(texts(report(loan()))).toContain(
      'Esta revisión no cuenta ningún importe cobrado por encima de un tope legal.',
    );
    expect(
      texts(report(loan({ earlyRepayment: repayment({ compensationCharged: 120 }) }))),
    ).toContain(
      'Por devolverlo antes, te cobraron 69,60 € por encima de los topes del art. 30, y hasta 70,00 € según cómo se lea un dato.',
    );
    expect(
      texts(report(loan({ earlyRepayment: repayment({ compensationCharged: 50.2 }) }))),
    ).toContain(
      'Por devolverlo antes, según cómo se lea un dato, la compensación pasaría de los topes del art. 30 hasta en 0,20 €; no se cuenta porque no pasa en todas las lecturas.',
    );
  });

  it('says over the general cap the lender may show a greater loss, and not when 30.3 rules it out', () => {
    const losses = /solo puede cobrar más si demuestra .* \(art\. 30\.4\)/;
    const summary = (input: CreditInput) => {
      const model = report(input);
      const all = model.blocks;
      const from = all.findIndex((b) => b.type === 'heading' && b.text === 'Resumen');
      const to = all.findIndex((b, i) => i > from && b.type === 'heading');
      return texts({ ...model, blocks: all.slice(from, to) }).join('\n');
    };
    expect(summary(loan({ earlyRepayment: repayment({ compensationCharged: 120 }) }))).toMatch(
      losses,
    );
    expect(
      summary(
        loan({ rateType: 'variable', earlyRepayment: repayment({ compensationCharged: 120 }) }),
      ),
    ).not.toMatch(losses);
  });

  it('ends with what the review does not check and where to find out for free', () => {
    const headings = model.blocks.flatMap((b) => (b.type === 'heading' ? [b.text] : []));
    expect(headings).toEqual([
      'Tus datos',
      'Resumen',
      'Partida por partida',
      'Las normas y criterios, y su estado',
      'Para que lo tengas en cuenta',
      'Lo que esta revisión no comprueba',
      'Dónde informarte gratis',
    ]);
  });
});
