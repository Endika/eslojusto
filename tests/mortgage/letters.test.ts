import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { LEGAL_INTEREST } from '../../src/engine/law/data/legal-interest';
import type { ExpenseItem, MortgageSource } from '../../src/engine/mortgage/expenses';
import { feeFindings, type FeeFinding, type FeeItem } from '../../src/engine/mortgage/fees';
import { reviewMortgage } from '../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput, Operation } from '../../src/engine/mortgage/types';
import { NO_DETAILS, type LetterDetails, type LetterKind } from '../../src/documents/letter';
import { renderPdf } from '../../src/documents/pdf';
import type { Block, DocumentModel } from '../../src/documents/ports';
import type { Translate } from '../../src/i18n/client';
import { mortgageCase } from '../../src/mortgage/case';
import {
  amountLines,
  amountsLetter,
  documentsLetter,
  mortgageLetterKinds,
} from '../../src/mortgage/letters';
import type { CompletedMortgageReview } from '../../src/mortgage/ports';
import { mortgageReport } from '../../src/mortgage/report';
import { FORBIDDEN, forbiddenIn } from '../support/forbidden';
import { DEPS, invoice, mortgage, TODAY } from '../engine/mortgage/input';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('mortgage');
const d = parseDate;

const completed = (
  change: Partial<MortgageInput>,
  deps: MortgageDeps = DEPS,
): CompletedMortgageReview => {
  const input = mortgage(change);
  const r = reviewMortgage(input, TODAY, deps);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { input, review: r.review };
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

// A deed of 10-03-2021, all under the LCCI: the lender bears the notary, the registry and the
// agency, the valuation is the borrower's and the notary's record is charged to nobody.
const LCCI_DEED = {
  deedOn: d('2021-03-10'),
  invoices: [
    invoice('notary_loan', 600),
    invoice('registry_mortgage', 400),
    invoice('agency', 300),
    invoice('valuation', 350),
    invoice('transparency_deed', 50),
  ],
} satisfies Partial<MortgageInput>;

// A deed of 14-12-2018: the tax is the lender's by law, the rest follows the Supreme Court's split.
const SPLIT_DEED = {
  deedOn: d('2018-12-14'),
  invoices: [
    invoice('notary_loan', 800),
    invoice('registry_mortgage', 400),
    invoice('ajd_loan', 1_500),
  ],
} satisfies Partial<MortgageInput>;

// 20.000 € repaid on 01-03-2022 from a variable rate of 2021, for 200 € of fee, the deed's option
// unknown: 30 € or 50 € of cap, so 170 € or 150 € over it.
const prepayment = (change: Partial<Operation> = {}): Operation => ({
  on: d('2022-03-01'),
  kind: 'partial_prepayment',
  principal: 20_000,
  feeCharged: 200,
  hadInsurance: null,
  ...change,
});

const DETAILS: LetterDetails = {
  ...NO_DETAILS,
  name: 'Alex Ejemplo',
  company: 'Banco Ficticio, S.A.',
  reference: 'PH-0000-TEST',
  place: 'Teruel',
  date: d('2026-10-09'),
};

describe('which mortgage letters a review offers', () => {
  it('always offers the free request for documents on a mortgage the review covers', () => {
    expect(mortgageLetterKinds(completed({}))).toEqual({ paid: [], free: ['mortgage_documents'] });
    expect(mortgageLetterKinds(completed({ invoices: [] }))).toEqual({
      paid: [],
      free: ['mortgage_documents'],
    });
  });

  it('offers no letter for a mortgage outside the review', () => {
    expect(mortgageLetterKinds(completed({ borrower: 'company' }))).toEqual({ paid: [], free: [] });
  });

  it('offers the amounts letter only with some item a law settles with euros', () => {
    expect(mortgageLetterKinds(completed(LCCI_DEED)).paid).toEqual(['mortgage_amounts']);
    expect(mortgageLetterKinds(completed(SPLIT_DEED)).paid).toEqual(['mortgage_amounts']);
    expect(
      mortgageLetterKinds(
        completed({ deedOn: d('2021-03-10'), rateType: 'variable', operations: [prepayment()] }),
      ).paid,
    ).toEqual(['mortgage_amounts']);
  });

  it('does not offer it when only the Supreme Court split carries euros, though the pass is', () => {
    const r = completed(
      { invoices: [invoice('notary_loan', 800), invoice('registry_mortgage', 400)] },
      DEPS,
    );
    expect(r.review.totals.caseLaw.principal).toBe(800);
    expect(r.review.offerPass).toBe(true);
    expect(mortgageLetterKinds(r).paid).toEqual([]);
  });

  it('does not offer it for a fee over its cap in only some readings', () => {
    // 35 € is over the 30 € cap of option a and within the 50 € of option b.
    const r = completed({
      deedOn: d('2021-03-10'),
      operations: [prepayment({ feeCharged: 35 })],
    });
    expect(r.review.totals.fees).toEqual({ counted: 0, upTo: 5 });
    expect(mortgageLetterKinds(r).paid).toEqual([]);
  });

  it('leaves out the costs by law once what the lender gave back covers them', () => {
    const covered = completed({ ...LCCI_DEED, alreadyReturned: 1_300 });
    expect(amountLines(covered).expenses.map((l) => l.item.kind)).toEqual(['transparency_deed']);
    const noRecord = { ...LCCI_DEED, invoices: LCCI_DEED.invoices.slice(0, 4) };
    expect(mortgageLetterKinds(completed({ ...noRecord, alreadyReturned: 1_300 })).paid).toEqual(
      [],
    );
    expect(mortgageLetterKinds(completed({ ...noRecord, alreadyReturned: 1_000 })).paid).toEqual([
      'mortgage_amounts',
    ]);
  });
});

describe('the lines of the amounts letter', () => {
  it('never carries an item of the Supreme Court split, even with a figure', () => {
    const r = completed(SPLIT_DEED, DEPS);
    expect(r.review.expenses.items.map((i) => [i.kind, i.basis, i.amount])).toEqual([
      ['notary_loan', 'case_law', 400],
      ['registry_mortgage', 'case_law', 400],
      ['ajd_loan', 'statute', 1_500],
    ]);
    const lines = amountLines(r);
    expect(lines.expenses.map((l) => [l.item.kind, l.amount])).toEqual([['ajd_loan', 1_500]]);
    const all = text(amountsLetter(r, DETAILS, tr));
    expect(all).toContain('Impuesto del préstamo (AJD): pagué 1.500,00 €.');
    expect(all).not.toMatch(/Notaría del préstamo|Registro de la hipoteca|Tribunal Supremo/);
    expect(all).not.toContain('400,00 €');
  });

  it('takes each cost the law puts on the lender, and the notary record charged to nobody', () => {
    const lines = amountLines(completed(LCCI_DEED));
    expect(lines.expenses.map((l) => [l.item.kind, l.item.status, l.amount])).toEqual([
      ['notary_loan', 'lender_bears', 600],
      ['registry_mortgage', 'lender_bears', 400],
      ['agency', 'lender_bears', 300],
      ['transparency_deed', 'not_chargeable', 50],
    ]);
  });

  it('takes the reading of a fee with the least over its cap', () => {
    const r = completed({ deedOn: d('2021-03-10'), operations: [prepayment()] });
    expect(amountLines(r).fees.map((l) => [l.amount, l.lowest, l.finding.cap])).toEqual([
      [150, true, 50],
    ]);
    const known = completed({
      deedOn: d('2021-03-10'),
      prepaymentOption: 'a_015_5y',
      operations: [prepayment()],
    });
    expect(amountLines(known).fees.map((l) => [l.amount, l.lowest])).toEqual([[170, false]]);
  });
});

describe('the lines of the amounts letter when the review is read differently', () => {
  const base = completed(LCCI_DEED);
  const item = base.review.expenses.items[0] as ExpenseItem;
  const fee = completed({
    deedOn: d('2021-03-10'),
    prepaymentOption: 'a_015_5y',
    operations: [prepayment()],
  }).review.fees[0] as FeeItem;
  const finding = feeFindings(fee)[0] as FeeFinding;
  const withItems = (items: ExpenseItem[], fees: FeeItem[] = []): CompletedMortgageReview => ({
    ...base,
    review: { ...base.review, expenses: { ...base.review.expenses, items }, fees },
  });
  const single = (change: Partial<FeeFinding>): FeeItem => ({
    kind: 'single',
    finding: { ...finding, ...change },
  });

  it.each([
    ['a cost the lender bears with nothing to give back', { amount: null }],
    ['a cost the lender bears for no euros', { amount: 0 }],
    ['a cost the borrower bears', { status: 'borrower_bears' }],
    ['a cost the bank paid', { status: 'paid_by_bank' }],
  ] as const)('leaves out %s', (_name, change) => {
    const lines = amountLines(withItems([{ ...item, ...change }]));
    expect(lines.expenses).toEqual([]);
  });

  it('leaves out a fee that is within its cap, whatever it carries', () => {
    const lines = amountLines(withItems([], [single({ status: 'within_cap', amount: 10 })]));
    expect(lines.fees).toEqual([]);
    const both: FeeItem = {
      kind: 'readings',
      readings: [
        { reading: 'a', finding: { ...finding, status: 'within_cap', amount: 5 } },
        { reading: 'b', finding: { ...finding, amount: 30 } },
      ],
    } as unknown as FeeItem;
    expect(amountLines(withItems([], [both])).fees).toEqual([]);
    const none = { kind: 'readings', readings: [] } as unknown as FeeItem;
    expect(amountLines(withItems([], [none])).fees).toEqual([]);
  });

  it('puts each source of an item once', () => {
    const first = item.sources[0] as MortgageSource;
    const second = { ...first, id: `${first.id}-other` };
    const model = amountsLetter(
      withItems([{ ...item, sources: [first, second, first] }]),
      DETAILS,
      tr,
    );
    expect(model.blocks.filter((b) => b.type === 'source')).toHaveLength(2);
  });

  it('writes no line for a fee whose operation is not in the answers', () => {
    const r = withItems([], [single({ index: 3 })]);
    const model = amountsLetter(r, DETAILS, tr);
    expect(text(model)).not.toMatch(/comisi/i);
  });
});

describe('the amounts letter', () => {
  it('gives the deed day, each cost with its norm and amount, and asks to review and reply', () => {
    const model = amountsLetter(completed(LCCI_DEED), DETAILS, tr);
    const all = text(model);
    expect(model.title).toBe('Revisión de los importes de mi hipoteca que fija la ley');
    expect(all).toContain(
      'Te escribo por mi préstamo hipotecario, formalizado en la escritura del 10-03-2021.',
    );
    expect(all).toContain(
      'Notaría del préstamo: pagué 600,00 €. La ley pone este gasto a cargo del banco.',
    );
    expect(all).toContain('Gestoría: pagué 300,00 €.');
    expect(all).toContain(
      'Acta notarial previa: pagué 50,00 €. La ley dice que esta acta no se cobra a quien pide el préstamo.',
    );
    expect(all).not.toContain('Tasación');
    expect(all).toContain('Te pido que lo revises y me respondas.');
    expect(model.blocks).toContainEqual({
      type: 'source',
      text: 'Ley de contratos de crédito inmobiliario, art. 14.1.e (Ley 5/2019, de 15 de marzo, reguladora de los contratos de crédito inmobiliario)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2019-3814#ar-14',
    });
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Número de préstamo',
      value: 'PH-0000-TEST',
      wrap: true,
    });
  });

  it('takes off what the lender already gave back', () => {
    const all = text(amountsLetter(completed({ ...LCCI_DEED, alreadyReturned: 300 }), DETAILS, tr));
    expect(all).toContain(
      'De los gastos de la constitución ya me diste 300,00 €, sin indicar de cuáles: descontados enteros de los que la ley pone a cargo del banco, quedan 1.000,00 €.',
    );
  });

  it('gives a fee over its cap with the cap, the difference and the reading it takes', () => {
    const all = text(
      amountsLetter(
        completed({ deedOn: d('2021-03-10'), operations: [prepayment()] }),
        NO_DETAILS,
        tr,
      ),
    );
    expect(all).toContain(
      'Amortización parcial del 01-03-2022: me cobraste 200,00 € de comisión. Sobre 20.000,00 € de capital amortizado, el tope que fija la ley es de 50,00 €, así que la comisión pasa de ese tope en 150,00 €.',
    );
    expect(all).toContain('estas cifras son las de la que da menos diferencia');
    expect(all).toContain('Ley de contratos de crédito inmobiliario, art. 23.5');
  });
});

describe('the request for documents', () => {
  it('asks for the deed, the invoices, the tax, the FEIN and FiAE and the prepayment settlement', () => {
    const model = documentsLetter(completed({ invoices: [] }), DETAILS, tr);
    const all = text(model);
    expect(model.title).toBe('Petición de documentación de mi hipoteca');
    expect(all).toContain('escritura del 10-05-2012');
    for (const asked of [
      'La escritura del préstamo hipotecario.',
      'Las facturas de notaría, registro, gestoría y tasación',
      'impuesto de actos jurídicos documentados (AJD)',
      '(FEIN) y la Ficha de Advertencias Estandarizadas (FiAE)',
      'La liquidación de cada amortización anticipada',
    ])
      expect(all).toContain(asked);
    // It only asks: no norm, no figure.
    expect(model.blocks.some((b) => b.type === 'source')).toBe(false);
    expect(all).not.toMatch(/€|ley/i);
  });
});

describe('the letters, block by block', () => {
  const echo: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
  const shape = (model: DocumentModel) =>
    model.blocks.flatMap((b) =>
      b.type === 'source'
        ? ['source']
        : 'text' in b
          ? [`${b.type}: ${b.text.replace(/[\u00a0\u202f]/g, ' ')}`]
          : [],
    );
  const AT = 'client.documents.letter.place_date {"lugar":"Teruel","fecha":"9 de octubre de 2026"}';
  const CLOSING = ['text: client.mortgage.letter.regards', `text: ${AT}`];
  const DEED_ON = (on: string) => `text: client.mortgage.letter.about {"fecha":"${on}"}`;
  const amounts = (change: Partial<MortgageInput>) =>
    shape(amountsLetter(completed(change), DETAILS, echo));
  const REGISTRY = { deedOn: d('2021-03-10'), invoices: [invoice('notary_loan', 600)] };
  const EXPENSE = [
    'text: client.mortgage.letter.amounts.expense {"gasto":"client.mortgage.invoice.notary_loan","importe":"600,00 €"}',
    'source',
  ];
  const FEE = (cap: string, over: string) =>
    `text: client.mortgage.letter.amounts.fee {"operacion":"client.mortgage.operation.partial_prepayment","fecha":"01-03-2022","cobrado":"200,00 €","capital":"20.000,00 €","tope":"${cap}","diferencia":"${over}"}`;
  const RETURNED = (back: string, left: string) =>
    `text: client.mortgage.letter.amounts.returned {"importe":"${back}","resto":"${left}"}`;
  const NOT_CHARGEABLE =
    'text: client.mortgage.letter.amounts.not_chargeable {"gasto":"client.mortgage.invoice.transparency_deed","importe":"50,00 €"}';
  const INTRO = 'text: client.mortgage.letter.amounts.intro';
  const ASK = 'text: client.mortgage.letter.amounts.ask';

  it('asks for the documents, one by one', () => {
    expect(shape(documentsLetter(completed({}), DETAILS, echo))).toEqual([
      'title: client.mortgage.letter.documents.title',
      DEED_ON('10-05-2012'),
      'text: client.mortgage.letter.documents.ask',
      'bullet: client.mortgage.letter.documents.deed',
      'bullet: client.mortgage.letter.documents.invoices',
      'bullet: client.mortgage.letter.documents.tax',
      'bullet: client.mortgage.letter.documents.fein',
      'bullet: client.mortgage.letter.documents.prepayment',
      'text: client.mortgage.letter.documents.missing',
      'text: client.mortgage.letter.documents.reply',
      ...CLOSING,
    ]);
  });

  it.each([
    [
      'a cost with what came back',
      { ...REGISTRY, alreadyReturned: 300 },
      [INTRO, ...EXPENSE, RETURNED('300,00 €', '300,00 €'), ASK],
    ],
    ['a cost with nothing back', REGISTRY, [INTRO, ...EXPENSE, ASK]],
    [
      'a cost the law puts on nobody, with all the rest given back',
      {
        ...REGISTRY,
        invoices: [invoice('notary_loan', 600), invoice('transparency_deed', 50)],
        alreadyReturned: 5_000,
      },
      [INTRO, NOT_CHARGEABLE, 'source', ASK],
    ],
    ['a cost all given back', { ...REGISTRY, alreadyReturned: 600 }, []],
    [
      'a fee over its cap in every reading',
      { deedOn: d('2021-03-10'), prepaymentOption: 'a_015_5y', operations: [prepayment()] },
      [INTRO, FEE('30,00 €', '170,00 €'), 'source', ASK],
    ],
    [
      'a fee over its cap in some readings',
      { deedOn: d('2021-03-10'), operations: [prepayment()] },
      [
        INTRO,
        FEE('50,00 €', '150,00 €'),
        'note: client.mortgage.letter.amounts.lowest',
        'source',
        ASK,
      ],
    ],
  ] as const)('puts in the amounts letter %s', (_name, input, body) => {
    const title = 'title: client.mortgage.letter.amounts.title';
    expect(amounts(input)).toEqual([title, DEED_ON('10-03-2021'), ...body, ...CLOSING]);
  });

  it('leaves the amounts letter without figures when no law settles one', () => {
    expect(amounts({})).toEqual([
      'title: client.mortgage.letter.amounts.title',
      DEED_ON('10-05-2012'),
      ...CLOSING,
    ]);
  });
});

describe('the letters', () => {
  const cases: [Partial<MortgageInput>, MortgageDeps][] = [
    [{}, DEPS],
    [LCCI_DEED, DEPS],
    [{ ...LCCI_DEED, alreadyReturned: 300, agreementOnExpenses: true }, DEPS],
    [SPLIT_DEED, DEPS],
    [{ deedOn: d('2021-03-10'), operations: [prepayment()] }, DEPS],
    [
      {
        deedOn: d('2005-03-01'),
        invoices: [invoice('notary_loan', 800, { paidOn: d('2005-03-01') })],
        clauses: [{ label: 'irph', present: true }],
      },
      DEPS,
    ],
  ];
  const models = cases.flatMap(([input, deps]) => {
    const c = mortgageCase(completed(input, deps), LEGAL_INTEREST);
    const kinds: LetterKind[] = [...c.letterKinds, ...(c.freeLetterKinds ?? [])];
    return [...kinds.map((kind) => c.letter(kind, DETAILS, tr)), c.report(tr, TODAY)];
  });

  it('inform without advising, asserting or pressing', () => {
    expect(models.length).toBeGreaterThan(12);
    for (const model of models) expect(forbiddenIn('client.mortgage.', text(model))).toEqual([]);
    // A letter never speaks of courts, lawyers or the Supreme Court's split.
    for (const model of models.filter((m) => m.footer === null))
      expect(text(model).toLowerCase()).not.toMatch(/tribunal|juzgado|juez|abogad|servicio de/);
  });

  it("end with the person's name and no line to sign on", () => {
    for (const model of models.filter((m) => m.footer === null)) {
      expect(model.blocks.at(-1)).toEqual({
        type: 'blank',
        label: 'Nombre y apellidos',
        value: 'Alex Ejemplo',
        wrap: true,
      });
      for (const forbidden of FORBIDDEN) expect(text(model).toLowerCase()).not.toMatch(forbidden);
    }
  });

  it('draw with the letter fonts', async () => {
    for (const model of models) expect((await renderPdf(model)).length).toBeGreaterThan(1000);
  });
});

describe('the mortgage review as the pass sees it', () => {
  it('offers the pass as the review does, the amounts letter for it and the free one apart', () => {
    const r = completed(LCCI_DEED);
    const c = mortgageCase(r, LEGAL_INTEREST);
    expect(c.offer).toBe(true);
    expect(c.letterKinds).toEqual(['mortgage_amounts']);
    expect(c.freeLetterKinds).toEqual(['mortgage_documents']);
    expect(c.filename?.('report')).toBe('client.mortgage.report.filename');
    expect(c.filename?.('letter', 'mortgage_documents')).toBe(
      'client.mortgage.letter.documents.filename',
    );
    expect(c.filename?.('letter', 'mortgage_amounts')).toBe(
      'client.mortgage.letter.amounts.filename',
    );
    expect(c.letter('mortgage_documents', NO_DETAILS, tr).title).toBe(
      'Petición de documentación de mi hipoteca',
    );
    expect(c.report(tr, TODAY)).toEqual(mortgageReport(r, LEGAL_INTEREST, tr, TODAY));
  });

  describe('selling it quietly', () => {
    const valuation = invoice('valuation', 300);
    const within = prepayment({ feeCharged: 10 });
    const REPAID = { deedOn: d('2021-03-10'), prepaymentOption: 'a_015_5y' } as const;
    const cases: [string, Partial<MortgageInput>, boolean][] = [
      ['an invoice the borrower bears', { deedOn: TODAY, invoices: [valuation] }, true],
      ['a fee within its cap', { ...REPAID, operations: [within] }, true],
      [
        'a fee within its cap and an invoice the borrower bears',
        { ...REPAID, invoices: [valuation], operations: [within] },
        true,
      ],
      [
        'a clause the deed lacks',
        { deedOn: TODAY, invoices: [valuation], clauses: [{ label: 'irph', present: false }] },
        true,
      ],
      ['nothing entered', { deedOn: TODAY }, false],
      [
        'only a figure not entered',
        { deedOn: TODAY, invoices: [invoice('notary_loan', null)] },
        false,
      ],
      [
        'a cost on the lender beside one the borrower bears',
        { deedOn: TODAY, invoices: [valuation, invoice('notary_loan', 300)] },
        false,
      ],
      [
        'a fee over its cap',
        { ...REPAID, invoices: [valuation], operations: [prepayment({ feeCharged: 200 })] },
        false,
      ],
      [
        'a fee over its cap in one reading only',
        {
          deedOn: d('2021-03-10'),
          invoices: [valuation],
          operations: [prepayment({ feeCharged: 35 })],
        },
        false,
      ],
      [
        'a fee within its cap in one reading and over it in the other',
        {
          deedOn: d('2021-03-10'),
          invoices: [valuation],
          operations: [prepayment({ feeCharged: 40 })],
        },
        false,
      ],
      [
        'a clause flagged',
        { deedOn: TODAY, invoices: [valuation], clauses: [{ label: 'irph', present: true }] },
        false,
      ],
    ];
    it.each(cases)('with %s', (_name, input, quiet) => {
      expect(mortgageCase(completed(input), LEGAL_INTEREST).quiet).toBe(quiet);
    });
  });

  it('words the letter and its file for the kind asked, the request for documents by default', () => {
    const c = mortgageCase(completed(LCCI_DEED), LEGAL_INTEREST);
    expect(c.letter('mortgage_amounts', DETAILS, tr).title).toBe(
      amountsLetter(completed(LCCI_DEED), DETAILS, tr).title,
    );
    expect(c.letter('mortgage_documents', DETAILS, tr).title).not.toBe(
      c.letter('mortgage_amounts', DETAILS, tr).title,
    );
    expect(c.filename?.('letter')).toBe('client.mortgage.letter.documents.filename');
  });

  it('does not offer the pass for clauses alone, and keeps the free letter', () => {
    const c = mortgageCase(
      completed({ deedOn: d('2005-03-01'), clauses: [{ label: 'irph', present: true }] }),
      LEGAL_INTEREST,
    );
    expect(c).toMatchObject({
      offer: false,
      letterKinds: [],
      freeLetterKinds: ['mortgage_documents'],
    });
  });
});
