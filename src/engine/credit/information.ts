import { creditPhrase, type CreditCalculation, type CreditPhraseKey } from './calculation';
import { unusedPremiumGuide } from './early-repayment';
import { cardPayoff } from './indicator';
import type { NormStatus, NormTable } from './norms';
import { ruleSource, type StatuteRuleId } from './rules';
import type { NormSource } from '../law/sources';
import { MENTION_LETTERS, type CreditInput, type MentionLetter } from './types';

// Blocks shown beside the review with their source and no verdict. Their figures never reach a
// total.
export type InformationBlockId =
  | 'contract_mentions'
  | 'linked_insurance'
  | 'unused_premium'
  | 'cash_price'
  | 'revolving_info'
  | 'card_payoff'
  | 'law_change';

export interface MentionCheck {
  readonly letter: MentionLetter;
  // Null when the person did not say.
  readonly present: boolean | null;
}

export interface InformationBlock {
  readonly id: InformationBlockId;
  readonly calculation: CreditCalculation;
  readonly sources: readonly NormSource<NormStatus>[];
  // The mentions of art. 16.2, for the contract mentions block only.
  readonly mentions: readonly MentionCheck[] | null;
}

const block = (
  id: InformationBlockId,
  keys: readonly (CreditPhraseKey | CreditCalculation[number])[],
  rules: readonly StatuteRuleId[],
  norms: NormTable,
  mentions: readonly MentionCheck[] | null = null,
): InformationBlock => ({
  id,
  calculation: keys.map((k) => (typeof k === 'string' ? creditPhrase(k) : k)),
  sources: rules.map((rule) => ruleSource(rule, norms)),
  mentions,
});

// Art. 16.2 lists what the contract must state; art. 21 says what follows when it does not.
function contractMentions(input: CreditInput, norms: NormTable): InformationBlock {
  const mentions = MENTION_LETTERS.map((letter) => ({
    letter,
    present: input.mentions[letter] ?? null,
  }));
  const missing = mentions.some((m) => m.present === false);
  return block(
    'contract_mentions',
    [
      'information.contract_mentions',
      ...(missing ? (['information.contract_mentions.missing'] as const) : []),
      'information.contract_mentions.consequences',
    ],
    ['contract_mentions', 'tae_missing', 'tae_inexact'],
    norms,
    mentions,
  );
}

function linkedInsurance(input: CreditInput, norms: NormTable): readonly InformationBlock[] {
  if (input.insurance === null) return [];
  const blocks = [
    block(
      'linked_insurance',
      [
        'information.linked_insurance.apr',
        'information.linked_insurance.withdrawal',
        'information.linked_insurance.unused_premium',
      ],
      ['tae_formula', 'withdrawal', 'unused_premium'],
      norms,
    ),
  ];
  const guide = unusedPremiumGuide(input);
  if (guide !== null)
    blocks.push(
      block(
        'unused_premium',
        [creditPhrase('information.unused_premium.guide', { euros: { euros: guide } })],
        ['unused_premium'],
        norms,
      ),
    );
  return blocks;
}

// What the contract owes a person who finances a car: the cash price of the goods (art. 16.2), and
// the option, at all times, of not taking the credit and paying as agreed with the seller (art. 26.3).
const cashPrice = (norms: NormTable): InformationBlock =>
  block(
    'cash_price',
    ['information.cash_price', 'information.cash_option'],
    ['contract_mentions', 'cash_option'],
    norms,
  );

// The statement and the breakdown a revolving card owes under the transparency order. Which
// lenders and which earlier contracts the order reaches has not been read, so it is told as what
// the order provides, not as what a given lender owes.
const revolvingInfo = (norms: NormTable): InformationBlock =>
  block('revolving_info', ['information.revolving_info'], ['revolving_info'], norms);

// How long the card's balance takes to clear with the payment entered and no new purchases.
function payoffBlock(input: CreditInput, norms: NormTable): readonly InformationBlock[] {
  const card = input.card;
  if (card === null || card.balance === 0) return [];
  const payoff = cardPayoff(card.balance, card.nominalRate, card.minimumPayment);
  const vars = { balance: { euros: card.balance }, payment: { euros: card.minimumPayment } };
  return [
    block(
      'card_payoff',
      [
        payoff.kind === 'never'
          ? creditPhrase('information.card_payoff.never', {
              ...vars,
              interest: { euros: payoff.monthlyInterest },
            })
          : creditPhrase('information.card_payoff.months', {
              ...vars,
              months: { integer: payoff.months },
              interest: { euros: payoff.interest },
            }),
      ],
      [],
      norms,
    ),
  ];
}

// The consumer credit law is about to change: the directive applies from 20-11-2026 and the bill
// that would transpose it is not law. A notice only.
const lawChange = (norms: NormTable): InformationBlock =>
  block(
    'law_change',
    ['information.law_change'],
    ['directive_notice', 'repayment_under_500', 'withdrawal_cap_12m', 'tae_caps'],
    norms,
  );

export function informationBlocks(
  input: CreditInput,
  norms: NormTable,
): readonly InformationBlock[] {
  const revolving = input.product === 'revolving';
  return [
    contractMentions(input, norms),
    ...linkedInsurance(input, norms),
    ...(input.product === 'car_loan' ? [cashPrice(norms)] : []),
    ...(revolving ? [revolvingInfo(norms), ...payoffBlock(input, norms)] : []),
    lawChange(norms),
  ];
}

// A revolving card concluded before the consumer credit law gets the indicator and its statement
// arithmetic only.
export function indicatorOnlyBlocks(
  input: CreditInput,
  norms: NormTable,
): readonly InformationBlock[] {
  return payoffBlock(input, norms);
}
