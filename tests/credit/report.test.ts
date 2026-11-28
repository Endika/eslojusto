import { describe, expect, it } from 'vitest';
import { reviewCredit } from '../../src/engine/credit/review';
import type { CreditInput } from '../../src/engine/credit/types';
import type { CompletedCreditReview } from '../../src/credit/ports';
import { creditReport } from '../../src/credit/report';
import type { Block, DocumentModel } from '../../src/documents/ports';
import type { Translate } from '../../src/i18n/client';
import { parseDate } from '../../src/engine/date';
import type { CreditItem } from '../../src/engine/credit/finding';
import { loan, repayment, TODAY } from '../engine/credit/input';
import { pageTranslator } from '../support/page-strings';
import { card, DEPS } from './fixtures';

const tr: Translate = pageTranslator('credit');

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
  const built = () => report(loan());

  it('dates the report and gives the data the person confirmed', () => {
    const model = built();
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
    const model = built();
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
    const model = built();
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
    const model = built();
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

describe('the data the report gives back', () => {
  const dataRows = (input: CreditInput) => {
    const { blocks } = report(input);
    const from = blocks.findIndex((b) => b.type === 'heading');
    const to = blocks.findIndex((b, i) => i > from && b.type === 'heading');
    return rows({ ...report(input), blocks: blocks.slice(from, to) });
  };
  const LOAN_TOP = [
    ['Tu crédito', 'Préstamo personal'],
    ['Cuando lo contrataste', '15-02-2019'],
    ['Cuando recibiste el dinero', '15-02-2019'],
    ['Importe del préstamo', '10.500,00 €'],
    ['Lo que recibiste', '9.738,75 €'],
    ['Tipo de interés nominal (TIN)', '12,00 %'],
    ['Tipo de interés', 'Fijo'],
    ['TAE que dice tu contrato', '12,00 %'],
    ['Importe total adeudado que dice tu contrato', '13.120,80 €'],
    ['Cuotas', '48 cuotas de 273,35 €, la primera el 15-03-2019'],
  ];
  const OPENING = ['Comisión de apertura', '761,25 €, descontados de lo que recibiste'];
  const charge = (kind: 'study' | 'other', how: 'paid' | 'financed') => ({
    kind,
    amount: kind === 'study' ? 50 : 20,
    paidOn: parseDate('2019-02-15'),
    how,
  });

  it.each([
    [
      'a card, with its limit and what it owes, and a figure the contract leaves out',
      () => card({ declaredApr: null, declaredTotalPayable: null }),
      [
        ['Tu crédito', 'Tarjeta revolving'],
        ['Cuando lo contrataste', '10-03-2024'],
        ['Cuando recibiste el dinero', '10-03-2024'],
        ['Límite de la tarjeta', '1.500,00 €'],
        ['Tipo de interés nominal (TIN)', '21,94 %'],
        ['Tipo de interés', 'Fijo'],
        ['TAE que dice tu contrato', 'Sin dato'],
        ['Importe total adeudado que dice tu contrato', 'Sin dato'],
        ['Deuda de la tarjeta', '1.200,00 €'],
        ['Cuota mensual', '60,00 €'],
        ['Cuota anual', '0,00 €'],
      ],
    ],
    [
      'a loan with a schedule, an undated final instalment, insurance in instalments and a repayment',
      () =>
        loan({
          netDisbursed: null,
          instalments: {
            kind: 'schedule',
            rows: [
              { dueOn: parseDate('2019-03-15'), amount: 300 },
              { dueOn: parseDate('2019-04-15'), amount: 300 },
            ],
          },
          balloon: { amount: 3_000, dueOn: null },
          insurance: { premium: 20, single: false, financed: false, required: true },
          earlyRepayment: repayment({ compensationCharged: 120 }),
        }),
      [
        ...LOAN_TOP.slice(0, 4),
        ['Lo que recibiste', 'Sin dato'],
        ...LOAN_TOP.slice(5, 9),
        ['Cuotas', 'Cuadro de 2 cuotas'],
        ['Cuota final', '3.000,00 €'],
        OPENING,
        ['Seguro ligado al crédito', 'Prima de 20,00 € con cada cuota'],
        ['Obligatorio para darte el crédito', 'Sí'],
        ['Devolución anticipada', '15-02-2021'],
        ['Capital devuelto', '5.000,00 €'],
        ['Compensación cobrada', '120,00 €'],
        ['Final pactado', '15-02-2023'],
      ],
    ],
    [
      'a loan with a dated final instalment, a financed single premium and charges paid apart',
      () =>
        loan({
          balloon: { amount: 3_000, dueOn: parseDate('2023-03-15') },
          insurance: { premium: 300, single: true, financed: true, required: false },
          charges: [charge('study', 'paid'), charge('other', 'financed')],
        }),
      [
        ...LOAN_TOP,
        ['Cuota final', '3.000,00 €, el 15-03-2023'],
        ['Comisión de estudio', '50,00 €, pagados aparte'],
        ['Otros gastos', '20,00 €, sumados al préstamo'],
        ['Seguro ligado al crédito', 'Prima única de 300,00 €'],
        ['Obligatorio para darte el crédito', 'No'],
      ],
    ],
    [
      'an insurance whose requirement the person does not know',
      () => loan({ insurance: { premium: 300, single: true, financed: false, required: null } }),
      [
        ...LOAN_TOP,
        OPENING,
        ['Seguro ligado al crédito', 'Prima única de 300,00 €'],
        ['Obligatorio para darte el crédito', 'No lo sé'],
      ],
    ],
  ] as [string, () => CreditInput, string[][]][])('%s', (_, input, expected) => {
    expect(dataRows(input())).toEqual(expected);
  });
});

describe('the blocks of the report', () => {
  const unsure = () =>
    loan({
      declaredApr: null,
      insurance: { premium: 300, single: true, financed: false, required: null },
      earlyRepayment: repayment({ compensationCharged: 120 }),
    });
  const completed = (input: CreditInput): CompletedCreditReview => {
    const r = reviewCredit(input, TODAY, DEPS);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    return { input, review: r.review };
  };
  const ofType = (model: DocumentModel, type: Block['type']) =>
    model.blocks.flatMap((b) =>
      b.type === type && 'text' in b ? [b.text.replace(/[\u00a0\u202f]/g, ' ')] : [],
    );

  it('gives each item its title, the way it is worked out and every reading under its own title', () => {
    const model = report(unsure());
    expect(ofType(model, 'subheading').slice(0, 4)).toEqual([
      'La TAE de tu contrato',
      'Compensación por devolverlo antes',
      'Desistir del crédito',
      'Tu TAE frente al tipo medio del Banco de España',
    ]);
    expect(ofType(model, 'note').filter((t) => t === 'Cómo se calcula')).toHaveLength(3);
    expect(
      ofType(model, 'note').filter((t) => t.startsWith('La TAE es el tipo anual')),
    ).toHaveLength(2);
    expect(ofType(model, 'text')).toEqual(
      expect.arrayContaining([
        'Si el seguro era obligatorio',
        'Si no lo era',
        'Con el capital y los intereses de ese día',
        'Con solo el capital',
        'Tu contrato no indica la TAE',
        'No lo has metido',
      ]),
    );
    expect(
      ofType(model, 'text').filter((t) => t.startsWith('Pagos con que se calcula')),
    ).toHaveLength(2);
    expect(ofType(model, 'bullet')).toEqual(
      expect.arrayContaining([
        'Falta la TAE con la que comparar, así que no se compara.',
        'Te cobraron 120,00 €: 69,60 € por encima de ese tope.',
      ]),
    );
  });

  it('cites each norm once in its item and once among the norms, with its state', () => {
    const sources = report(unsure()).blocks.flatMap((b) => (b.type === 'source' ? [b] : []));
    expect(
      sources.filter((s) => s.text.startsWith('Ley de contratos de crédito al consumo, art. 30.2')),
    ).toHaveLength(2);
    const norm = sources.find((s) => s.text.includes('art. 30.2'));
    expect(norm?.text).toMatch(/ · con efectos desde el 25-09-2011 · en vigor$/);
    expect(norm?.url).toMatch(/^https:/);
    const indicator = report(loan())
      .blocks.flatMap((b) => (b.type === 'source' ? [b] : []))
      .find((s) => s.text.includes('STS 366/2026'));
    expect(indicator?.text).toContain(' · criterio del Tribunal Supremo · ');
    expect(indicator?.url).toMatch(/^https:/);
  });

  it('words the total as one figure when every reading agrees on it', () => {
    expect(
      texts(
        report(
          loan({ earlyRepayment: repayment({ compensationCharged: 120, interestSettled: null }) }),
        ),
      ),
    ).toContain('Por devolverlo antes, te cobraron 70,00 € por encima de los topes del art. 30.');
  });

  it('notes a card from before the law and says what it compares', () => {
    const old = card({ agreedOn: parseDate('2009-04-01'), drawnOn: parseDate('2009-04-01') });
    expect(ofType(report(old), 'note')).toContain(
      'Tu tarjeta es anterior al 25-09-2011, cuando entró en vigor la Ley 16/2011: aquí solo se compara su TAE con el tipo medio, un criterio del Tribunal Supremo que no depende de la fecha del contrato.',
    );
    expect(ofType(report(loan()), 'note')).not.toContain(expect.stringContaining('anterior al'));
  });

  it('opens with its title, the day it was made and what it compares, and closes with where to ask', () => {
    const { blocks } = report(loan());
    expect(blocks.slice(0, 4).map((b) => b.type)).toEqual(['title', 'meta', 'rule', 'text']);
    expect(ofType(report(loan()), 'title')).toEqual(['Revisión de tu préstamo o tu tarjeta']);
    expect(ofType(report(loan()), 'meta')).toEqual(['eslojusto.es · 9 de octubre de 2026']);
    expect(blocks.at(-2)).toMatchObject({ type: 'heading', text: 'Dónde informarte gratis' });
    expect(blocks.at(-1)).toMatchObject({ type: 'text' });
  });

  it('lists each piece of information with its text and its norms, and what the review leaves unchecked', () => {
    const real = completed(loan());
    const model = creditReport(real, tr, TODAY);
    expect(ofType(model, 'subheading')).toEqual(
      expect.arrayContaining(['Lo que tiene que decir tu contrato']),
    );
    const from = model.blocks.findIndex(
      (b) => b.type === 'subheading' && b.text === 'Lo que tiene que decir tu contrato',
    );
    expect(model.blocks.slice(from, from + 5).map((b) => b.type)).toEqual([
      'subheading',
      'text',
      'source',
      'source',
      'source',
    ]);
    expect(ofType(model, 'text')).toContainEqual(
      expect.stringContaining('(art. 16.2). Lo que pasa si falta alguna'),
    );
    expect(ofType(model, 'bullet').slice(-5)).toEqual([
      'Si las cláusulas de tu contrato son claras y válidas',
      'Si un seguro era de verdad obligatorio',
      'Las comisiones por impago',
      'Los cambios de límite de una tarjeta',
      'Lo que cambie con la nueva ley de crédito al consumo',
    ]);
  });

  it.each([
    ['nothing over a cap', () => loan(), ['text']],
    [
      'an amount that is not over in every reading',
      () => loan({ earlyRepayment: repayment({ compensationCharged: 50.2 }) }),
      ['text', 'note'],
    ],
    [
      'an amount over in every reading, with the lender’s right to show a greater loss',
      () => loan({ earlyRepayment: repayment({ compensationCharged: 120 }) }),
      ['text', 'note'],
    ],
    [
      'one amount whatever the reading',
      () =>
        loan({ earlyRepayment: repayment({ compensationCharged: 120, interestSettled: null }) }),
      ['text', 'note'],
    ],
  ] as [string, () => CreditInput, string[]][])('types the summary of %s', (_, input, expected) => {
    const { blocks } = report(input());
    const from = blocks.findIndex((b) => b.type === 'heading' && b.text === 'Resumen');
    const to = blocks.findIndex((b, i) => i > from && b.type === 'heading');
    expect(blocks.slice(from + 1, to).map((b) => b.type)).toEqual(expected);
  });

  it('cites a norm once in each section', () => {
    const sections: string[][] = [];
    for (const b of report(unsure()).blocks) {
      if (b.type === 'heading' || b.type === 'subheading') sections.push([]);
      else if (b.type === 'source') sections.at(-1)?.push(b.text);
    }
    expect(sections.length).toBeGreaterThan(5);
    for (const cited of sections) expect(new Set(cited).size).toBe(cited.length);
  });

  describe('built from a review that carries less than it should', () => {
    const subheadings = (r: CompletedCreditReview) =>
      ofType(creditReport(r, tr, TODAY), 'subheading');
    const headings = (r: CompletedCreditReview) => ofType(creditReport(r, tr, TODAY), 'heading');

    it('leaves out the indicator and the information it does not have', () => {
      const real = completed(loan());
      const bare = { ...real, review: { ...real.review, indicator: null, information: [] } };
      expect(subheadings(bare)).not.toContain('Tu TAE frente al tipo medio del Banco de España');
      expect(headings(bare)).not.toContain('Para que lo tengas en cuenta');
      expect(headings(real)).toContain('Para que lo tengas en cuenta');
      expect(creditReport(bare, tr, TODAY).blocks.every((b) => typeof b === 'object')).toBe(true);
    });

    it('gives nothing for an item without findings', () => {
      const real = completed(loan());
      const empty: CreditItem = { kind: 'readings', question: 'repayment_base', readings: [] };
      const withEmpty = { ...real, review: { ...real.review, items: [empty] } };
      const withNone = { ...real, review: { ...real.review, items: [] } };
      expect(creditReport(withEmpty, tr, TODAY)).toEqual(creditReport(withNone, tr, TODAY));
    });
  });
});
