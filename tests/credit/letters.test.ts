import { describe, expect, it } from 'vitest';
import { BE1904 } from '../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../src/engine/credit/data/sources';
import { reviewCredit } from '../../src/engine/credit/review';
import type { CreditInput } from '../../src/engine/credit/types';
import { parseDate } from '../../src/engine/date';
import { creditCase } from '../../src/credit/case';
import {
  creditLetterKinds,
  informationLetter,
  repaymentLetter,
  repaymentLine,
} from '../../src/credit/letters';
import type { CompletedCreditReview } from '../../src/credit/ports';
import { creditReport } from '../../src/credit/report';
import { NO_DETAILS, type LetterDetails, type LetterKind } from '../../src/documents/letter';
import { renderPdf } from '../../src/documents/pdf';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { FORBIDDEN, forbiddenIn } from '../support/forbidden';
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

const completed = (input: CreditInput): CompletedCreditReview => {
  const r = reviewCredit(input, TODAY, DEPS);
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

// A synthetic revolving card with a balance, on the assumptions of annex I, part II.
const card = (change: Partial<CreditInput> = {}): CreditInput =>
  loan({
    product: 'revolving',
    agreedOn: parseDate('2024-03-10'),
    drawnOn: parseDate('2024-03-10'),
    principal: 1_500,
    netDisbursed: null,
    nominalRate: 21.94,
    declaredApr: 24.29,
    declaredTotalPayable: null,
    instalments: null,
    charges: [],
    card: { limit: 1_500, nominalRate: 21.94, annualFee: 0, minimumPayment: 60, balance: 1_200 },
    ...change,
  });

// 5.000 € repaid on 15-02-2021 with exactly two years left and 40 € of interest settled that day:
// the cap is 1 % of 5.040 € (50,40 €) or of 5.000 € (50 €), whichever base art. 30.2 means.
const repaid = (change: Parameters<typeof repayment>[0] = {}) =>
  loan({ earlyRepayment: repayment(change) });

const DETAILS: LetterDetails = {
  ...NO_DETAILS,
  name: 'Alex Ejemplo',
  company: 'Financiera Ficticia, S.A.',
  reference: 'PF-0000-TEST',
  place: 'Teruel',
  date: parseDate('2026-10-09'),
};

describe('which credit letters a review offers', () => {
  it('always offers the free request for information on a credit the review covers', () => {
    expect(creditLetterKinds(completed(loan()))).toEqual({
      paid: [],
      free: ['credit_information'],
    });
    expect(creditLetterKinds(completed(card()))).toEqual({
      paid: [],
      free: ['credit_information'],
    });
  });

  it('offers no letter for a credit outside the review', () => {
    expect(creditLetterKinds(completed(loan({ secured: 'mortgage' })))).toEqual({
      paid: [],
      free: [],
    });
  });

  it('offers the early repayment letter only with compensation over a cap in every reading', () => {
    expect(creditLetterKinds(completed(repaid({ compensationCharged: 50 }))).paid).toEqual([]);
    // 50,20 € is over the 50 € cap on capital alone and within the 50,40 € on capital and interest.
    expect(creditLetterKinds(completed(repaid({ compensationCharged: 50.2 }))).paid).toEqual([]);
    expect(creditLetterKinds(completed(repaid({ compensationCharged: 120 }))).paid).toEqual([
      'early_repayment_review',
    ]);
  });

  it('takes the reading with the least over the cap', () => {
    const line = repaymentLine(completed(repaid({ compensationCharged: 120 })).review);
    expect(line?.finding.amount).toBe(69.6);
    expect(line?.lowest).toBe(true);
    const single = repaymentLine(
      completed(repaid({ compensationCharged: 120, interestSettled: null })).review,
    );
    expect(single).toMatchObject({ finding: { amount: 70 }, lowest: false });
  });
});

describe('the request for the credit information', () => {
  it('asks a loan for its amortisation schedule, with the article and its link', () => {
    const model = informationLetter(completed(loan()), CREDIT_NORMS, DETAILS, tr);
    const all = text(model);
    expect(model.title).toBe('Petición de información de mi crédito');
    expect(all).toContain('Te escribo por mi préstamo personal, que contraté el 15-02-2019.');
    expect(all).toContain('El art. 16.2.i de la Ley 16/2011');
    expect(all).toContain('cuadro de amortización');
    expect(all).not.toContain('desglose');
    expect(model.blocks).toContainEqual({
      type: 'source',
      text: 'Ley de contratos de crédito al consumo, art. 16.2 (Ley 16/2011, de 24 de junio, de contratos de crédito al consumo)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2011-10970#a16',
    });
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Número de contrato',
      value: 'PF-0000-TEST',
      wrap: true,
    });
  });

  it('asks a revolving card for the breakdown, as what the transparency order provides', () => {
    const all = text(informationLetter(completed(card()), CREDIT_NORMS, NO_DETAILS, tr));
    expect(all).toContain('tarjeta de pago aplazado (revolving), que contraté el 10-03-2024');
    expect(all).toContain('Te pido el desglose');
    expect(all).toContain('Orden de transparencia bancaria, arts. 33 quinquies y 33 sexies');
    // Which lenders the order reaches has not been read: the letter never says this one owes it.
    expect(all).not.toMatch(/\bdebes\b|\bobligad[oa]\b|5 días hábiles/);
  });
});

describe('the early repayment letter', () => {
  it('gives the amount repaid, the time left, the cap, the difference and art. 30.4', () => {
    const all = text(repaymentLetter(completed(repaid({ compensationCharged: 120 })), DETAILS, tr));
    expect(all).toContain(
      'El 15-02-2021 devolví antes de tiempo 5.000,00 € de capital y me cobraste 120,00 € como compensación',
    );
    expect(all).toContain('El final pactado del crédito era el 15-02-2023.');
    expect(all).toContain('quedaba más de un año');
    expect(all).toContain('el 1 % del importe reembolsado');
    expect(all).toContain('Sobre 5.040,00 €, el capital más los intereses liquidados ese día');
    expect(all).toContain('el tope es de 50,40 €');
    expect(all).toContain('pasa de ese tope en 69,60 €');
    expect(all).toContain('art. 30.4');
    expect(all).toContain('estas cifras son las de la que da menos diferencia');
  });

  it('uses half a percent with a year or less left, the year counted date to date', () => {
    const all = text(
      repaymentLetter(
        completed(
          repaid({
            compensationCharged: 120,
            interestSettled: null,
            agreedEndOn: parseDate('2022-02-15'),
          }),
        ),
        NO_DETAILS,
        tr,
      ),
    );
    expect(all).toContain('quedaba un año o menos');
    expect(all).toContain('Sobre 5.000,00 €, el capital devuelto, el tope es de 25,00 €.');
    expect(all).toContain('pasa de ese tope en 95,00 €');
    expect(all).not.toContain('menos diferencia');
  });

  it('names the interest left as the cap when it binds', () => {
    const all = text(
      repaymentLetter(
        completed(
          repaid({ compensationCharged: 120, interestSettled: null, remainingInterest: 30 }),
        ),
        NO_DETAILS,
        tr,
      ),
    );
    expect(all).toContain('(art. 30.5): el tope queda en 30,00 €');
    expect(all).toContain('pasa de ese tope en 90,00 €');
  });

  it('says art. 30.3 allows no compensation for a variable rate or a repayment an insurance paid', () => {
    const variable = text(
      repaymentLetter(
        completed(loan({ rateType: 'variable', earlyRepayment: repayment() })),
        NO_DETAILS,
        tr,
      ),
    );
    expect(variable).toContain('el tipo de interés no era fijo');
    expect(variable).toContain('art. 30.3');
    expect(variable).toContain('Te pido que revises este cobro.');
    expect(variable).not.toContain('art. 30.4');
    const insured = text(
      repaymentLetter(completed(repaid({ paidByInsurance: true })), NO_DETAILS, tr),
    );
    expect(insured).toContain('El reembolso lo pagó un seguro');
  });
});

describe('the letters', () => {
  const cases = [
    loan(),
    card(),
    repaid({ compensationCharged: 120 }),
    repaid({ compensationCharged: 120, agreedEndOn: parseDate('2022-01-15') }),
    loan({ rateType: 'variable', earlyRepayment: repayment() }),
    repaid({ paidByInsurance: true }),
  ];
  const models = cases.flatMap((input) => {
    const c = creditCase(completed(input), CREDIT_NORMS);
    const kinds: LetterKind[] = [...c.letterKinds, ...(c.freeLetterKinds ?? [])];
    return [...kinds.map((kind) => c.letter(kind, DETAILS, tr)), c.report(tr, TODAY)];
  });

  it('inform without advising, asserting or pressing', () => {
    expect(models.length).toBeGreaterThan(10);
    for (const model of models) expect(forbiddenIn('client.credit.', text(model))).toEqual([]);
    // A letter never speaks of usury, courts or lawyers.
    for (const model of models.filter((m) => m.footer === null))
      expect(text(model).toLowerCase()).not.toMatch(/usura|tribunal|juzgado|abogad|servicio de/);
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

describe('the credit review as the pass sees it', () => {
  it('offers the pass as the review does, the early repayment letter for it and the free one apart', () => {
    const r = completed(repaid({ compensationCharged: 120 }));
    const c = creditCase(r, CREDIT_NORMS);
    expect(c.offer).toBe(true);
    expect(c.letterKinds).toEqual(['early_repayment_review']);
    expect(c.freeLetterKinds).toEqual(['credit_information']);
    expect(c.filename?.('report')).toBe('client.credit.report.filename');
    expect(c.filename?.('letter', 'credit_information')).toBe(
      'client.credit.letter.information.filename',
    );
    expect(c.filename?.('letter', 'early_repayment_review')).toBe(
      'client.credit.letter.repayment.filename',
    );
    expect(c.letter('early_repayment_review', NO_DETAILS, tr).title).toBe(
      'Revisión de la compensación por devolver antes el crédito',
    );
    expect(c.report(tr, TODAY)).toEqual(creditReport(r, tr, TODAY));
  });

  it('does not offer the pass for the indicator alone, and keeps the free letter', () => {
    const c = creditCase(completed(card({ declaredApr: 30 })), CREDIT_NORMS);
    expect(c).toMatchObject({
      offer: false,
      letterKinds: [],
      freeLetterKinds: ['credit_information'],
    });
  });
});
