import { rentalPhrase as p, type RentalPhrase } from './calculation';
import { itemReading, itemResult, readAcross, type ItemReading, type ItemResult } from './item';
import type { NormTable } from './norms';
import type { Doubt, Outcome } from './outcome';
import { ruleFrame } from './rule-worlds';
import type { RuleId } from './rules';
import type { Fee, FeeKind, RentalInput } from './types';

// The two names the law gives the charge: «gestión inmobiliaria» and «formalización del contrato».
const NAMED: ReadonlySet<FeeKind> = new Set(['agency_fee', 'formalisation']);

function feeReading(
  input: RentalInput,
  fee: Fee,
  index: number,
  norms: NormTable,
): Outcome<ItemReading> {
  const frame = ruleFrame(input.signedOn, ['fees_2019', 'fees_2023', 'fees_2026'], norms);
  const named = NAMED.has(fee.kind);
  const requestId = `fee_request:${index}`;
  const doubts: Doubt[] = [...frame.doubts];
  if (!named && fee.requestedInWriting === null && frame.active.has('fees_2026'))
    doubts.push({ id: requestId, reason: 'agreement_unknown' });
  const paidOver = (why: RentalPhrase, rule: RuleId) =>
    itemReading(
      'paid_over',
      fee.amount,
      [why, p('fees.paid_over', { amount: { euros: fee.amount } })],
      [rule],
    );

  return readAcross(doubts, (world) => {
    // LAU art. 20.2 as reworded by RDL 29/2026: never on the tenant «bajo ningún concepto o
    // denominación»; another service only if the tenant asked for it in writing.
    if (frame.holds('fees_2026', world)) {
      const requested = fee.requestedInWriting ?? world[requestId] === true;
      if (!named && requested)
        return itemReading('not_checkable', null, [p('fees.requested_in_writing')], ['fees_2026']);
      return paidOver(p('fees.any_name'), 'fees_2026');
    }
    // Before it, only the two named charges are settled; another name is left for the person to
    // look at, with no figure.
    if (frame.holds('fees_2023', world))
      return named
        ? paidOver(p('fees.landlord_pays'), 'fees_2023')
        : itemReading('review_it', null, [p('fees.other_name')], ['fees_2023']);
    if (frame.holds('fees_2019', world)) {
      if (input.landlordType === 'person')
        return itemReading(
          'not_applicable_to_date',
          null,
          [p('fees.person_landlord')],
          ['fees_2019'],
        );
      return named
        ? paidOver(p('fees.company_landlord'), 'fees_2019')
        : itemReading('review_it', null, [p('fees.other_name')], ['fees_2019']);
    }
    // Signed before RDL 7/2019: outside the review, which stops at the door.
    return itemReading('not_applicable_to_date', null, [], []);
  });
}

// Agency and formalisation fees by the day the contract was signed (LAU art. 20). Amounts paid as
// an advance and taken off rent or deposit later are not fees.
export function checkFees(input: RentalInput, norms: NormTable): readonly ItemResult[] {
  return input.fees.flatMap((fee, index) =>
    fee.deductedLater
      ? []
      : [itemResult('fee', { index }, feeReading(input, fee, index, norms), norms)],
  );
}
