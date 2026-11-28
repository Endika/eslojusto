// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applies, gate } from '../../src/credit/conditions';
import { SHEETS, type Sheet } from '../../src/credit/form';
import { CREDIT_FLOW } from '../../src/credit/steps';
import { parseDate } from '../../src/engine/date';

type Answers = Readonly<Record<string, string>>;

const LOAN: Answers = {
  product: 'personal_loan',
  purpose: 'personal',
  principal: '10500',
  agreedOn: '2019-02-15',
};
const CARD: Answers = {
  product: 'revolving',
  purpose: 'personal',
  cardLimit: '1500',
  agreedOn: '2019-02-15',
};
const OLD_CARD: Answers = { ...CARD, agreedOn: '2009-04-01' };
const MORTGAGE: Answers = { ...LOAN, product: 'mortgage' };

// Every answer is a checked radio, which is how `chosen` and FormData read it.
function form(answers: Answers): HTMLFormElement {
  const el = document.createElement('form');
  for (const [name, value] of Object.entries(answers)) {
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = true;
    el.append(input);
  }
  return el;
}

describe('the gate', () => {
  it('lets the visit go on while the door answers do not read', () => {
    expect(gate(form({}))).toEqual({ inScope: true, indicatorOnly: false });
  });
});

describe('the sheets a credit is asked', () => {
  const IN_SCOPE_ALWAYS: Sheet[] = ['uso', 'importe', 'contrato', 'interes', 'desistimiento'];

  it('asks each credit only the sheets its answers call for, and shows the result whatever they are', () => {
    const rows: [string, Answers, Sheet[]][] = [
      ['a mortgage skips every sheet but the product and the result', MORTGAGE, ['producto']],
      [
        'a card of before the 2011 law is asked only what its indicator needs',
        OLD_CARD,
        ['producto', 'uso', 'importe', 'contrato', 'interes', 'tae', 'tarjeta'],
      ],
      [
        'a loan stating its APR is not asked the card',
        { ...LOAN, aprStated: 'yes' },
        [
          ...IN_SCOPE_ALWAYS,
          'producto',
          'tae',
          'cuotas',
          'cuota-final',
          'apertura',
          'otros-gastos',
          'seguro',
          'amortizacion',
          'comparar',
        ],
      ],
      [
        'a loan without an APR stated skips the comparison',
        { ...LOAN, aprStated: 'no' },
        [
          ...IN_SCOPE_ALWAYS,
          'producto',
          'tae',
          'cuotas',
          'cuota-final',
          'apertura',
          'otros-gastos',
          'seguro',
          'amortizacion',
        ],
      ],
      [
        'a loan with insurance and an early repayment is asked about both',
        { ...LOAN, aprStated: 'no', hasInsurance: 'yes', repaid: 'yes' },
        [
          ...IN_SCOPE_ALWAYS,
          'producto',
          'tae',
          'cuotas',
          'cuota-final',
          'apertura',
          'otros-gastos',
          'seguro',
          'seguro-pago',
          'amortizacion',
          'compensacion',
          'fin-pactado',
          'detalles',
        ],
      ],
      [
        'a card of after the law is asked its figures and no loan sheet',
        { ...CARD, aprStated: 'no' },
        [...IN_SCOPE_ALWAYS, 'producto', 'tae', 'tarjeta'],
      ],
    ];
    for (const [, answers, asked] of rows) {
      const f = form(answers);
      expect(SHEETS.filter((s) => applies(f, s))).toEqual(SHEETS.filter((s) => asked.includes(s)));
    }
    expect(applies(form(MORTGAGE), 'resultado')).toBe(true);
    expect(applies(form({}), 'resultado')).toBe(true);
  });
});

describe('the flow of the credit review', () => {
  const today = parseDate('2026-10-09');

  it('completes the result without reading any sheet, and a sheet only once its answers read', () => {
    expect(CREDIT_FLOW.complete(form({ product: 'boat' }), 'resultado', today)).toBe(true);
    expect(CREDIT_FLOW.complete(form({ product: 'boat' }), 'producto', today)).toBe(false);
    expect(CREDIT_FLOW.complete(form({ product: 'personal_loan' }), 'producto', today)).toBe(true);
  });
});
