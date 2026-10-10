import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { LEGAL_INTEREST } from '../../src/engine/law/data/legal-interest';
import { reviewMortgage } from '../../src/engine/mortgage/review';
import type { MortgageDeps, MortgageInput, Operation } from '../../src/engine/mortgage/types';
import { NO_DETAILS, type LetterDetails, type LetterKind } from '../../src/documents/letter';
import { renderPdf } from '../../src/documents/pdf';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { t } from '../../src/i18n';
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
import { DEPS, invoice, mortgage, READ_DEPS, TODAY } from '../engine/mortgage/input';

const tr: Translate = (key, vars) => t('es', key, vars);
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
      READ_DEPS,
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
    const r = completed(SPLIT_DEED, READ_DEPS);
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

describe('the letters', () => {
  const cases: [Partial<MortgageInput>, MortgageDeps][] = [
    [{}, DEPS],
    [LCCI_DEED, DEPS],
    [{ ...LCCI_DEED, alreadyReturned: 300, agreementOnExpenses: true }, DEPS],
    [SPLIT_DEED, READ_DEPS],
    [{ deedOn: d('2021-03-10'), operations: [prepayment()] }, DEPS],
    [
      {
        deedOn: d('2005-03-01'),
        invoices: [invoice('notary_loan', 800, { paidOn: d('2005-03-01') })],
        clauses: [{ label: 'irph', present: true }],
      },
      READ_DEPS,
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
