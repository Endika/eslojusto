import { describe, expect, it } from 'vitest';
import { CREDIT_NORMS } from '../../../src/engine/credit/data/norms';
import { informationBlocks } from '../../../src/engine/credit/information';
import type { CreditInput } from '../../../src/engine/credit/types';
import { loan, repayment } from './input';

const blocks = (change: Partial<CreditInput> = {}) => informationBlocks(loan(change), CREDIT_NORMS);
const ids = (change: Partial<CreditInput> = {}) => blocks(change).map((b) => b.id);

const card = {
  product: 'revolving' as const,
  instalments: null,
  card: { limit: 3_000, nominalRate: 24, annualFee: 0, minimumPayment: 60, balance: 3_000 },
};

describe('information blocks', () => {
  it('always list the mentions of art. 16.2 and the change of law to come', () => {
    // A personal loan also gets what a credit linked to one purchase means.
    expect(ids()).toEqual(['contract_mentions', 'linked_credit', 'law_change']);
  });

  it('mark each mention of art. 16.2 as present, absent or not answered', () => {
    const [mentions] = blocks({ mentions: { a: true, e: false } });
    expect(mentions?.mentions?.slice(0, 4)).toEqual([
      { letter: 'a', present: true },
      { letter: 'c', present: null },
      { letter: 'd', present: null },
      { letter: 'e', present: false },
    ]);
    expect(mentions?.mentions).toHaveLength(14);
    expect(mentions?.calculation.map((p) => p.key)).toContain(
      'information.contract_mentions.missing',
    );
    expect(mentions?.sources.map((s) => s.url.split('#')[1])).toEqual(['a16', 'a21', 'a21']);
  });

  const shape = (change: Partial<CreditInput>) =>
    blocks(change).map((b) => [b.id, b.calculation, b.sources.map((s) => s.id)]);
  const phrases = (...keys: string[]) => keys.map((key) => ({ key }));
  const mentionsBlock = (...keys: string[]) => [
    'contract_mentions',
    phrases('information.contract_mentions', ...keys, 'information.contract_mentions.consequences'),
    ['contract_mentions', 'tae_missing', 'tae_inexact'],
  ];
  const lawChange = [
    'law_change',
    phrases('information.law_change'),
    ['directive_notice', 'repayment_under_500', 'withdrawal_cap_12m', 'tae_caps'],
  ];
  const cashOption = ['contract_mentions', 'cash_option'];

  it.each([
    [
      'a loan with a single insurance and a mention missing',
      {
        insurance: { premium: 480, single: true, financed: true, required: true },
        earlyRepayment: repayment(),
        mentions: { a: false },
      },
      [
        mentionsBlock('information.contract_mentions.missing'),
        [
          'linked_insurance',
          phrases(
            'information.linked_insurance.apr',
            'information.linked_insurance.withdrawal',
            'information.linked_insurance.unused_premium',
          ),
          ['tae_formula', 'withdrawal', 'unused_premium'],
        ],
        [
          'unused_premium',
          [{ key: 'information.unused_premium.guide', vars: { euros: { euros: 239.84 } } }],
          ['unused_premium'],
        ],
        [
          'linked_credit',
          phrases('information.linked_credit', 'information.cash_option'),
          ['linked_credit', ...cashOption],
        ],
        lawChange,
      ],
    ],
    [
      'a car loan, mentions all present',
      { product: 'car_loan', mentions: { a: true } },
      [
        mentionsBlock(),
        ['cash_price', phrases('information.cash_price', 'information.cash_option'), cashOption],
        lawChange,
      ],
    ],
    [
      'a card paid off in months',
      { ...card, card: { ...card.card, minimumPayment: 100 } },
      [
        mentionsBlock(),
        ['revolving_info', phrases('information.revolving_info'), ['revolving_info']],
        [
          'card_payoff',
          [
            {
              key: 'information.card_payoff.months',
              vars: {
                balance: { euros: 3000 },
                payment: { euros: 100 },
                months: { integer: 47 },
                interest: { euros: 1627.31 },
              },
            },
          ],
          [],
        ],
        lawChange,
      ],
    ],
    [
      'a card never paid off',
      card,
      [
        mentionsBlock(),
        ['revolving_info', phrases('information.revolving_info'), ['revolving_info']],
        [
          'card_payoff',
          [
            {
              key: 'information.card_payoff.never',
              vars: {
                balance: { euros: 3000 },
                payment: { euros: 60 },
                interest: { euros: 60 },
              },
            },
          ],
          [],
        ],
        lawChange,
      ],
    ],
  ] as const)('spell out %s', (_, change, expected) => {
    expect(shape(change as Partial<CreditInput>)).toStrictEqual(expected);
  });

  it.each([
    ['no card', null],
    ['a card with nothing owed', { ...card.card, balance: 0 }],
  ])('give a revolving card with %s no payoff', (_, cardData) => {
    expect(ids({ ...card, card: cardData })).toEqual([
      'contract_mentions',
      'revolving_info',
      'law_change',
    ]);
  });
});
