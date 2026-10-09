import { addDays } from '../date';
import { round2 } from '../money';
import { billsPhrase, type BillsPhrase } from './calculation';
import { periodOf } from './electricity-tolls';
import {
  acrossOfficial,
  billFinding,
  LINE_TOLERANCE,
  pendingOfficial,
  type BillFinding,
  type BillItem,
} from './finding';
import type { NormTable } from './norms';
import { officialValues, periodDays, proratedOver } from './period';
import type { BillsRuleId } from './rules';
import type { BillsTables, MeterRent } from './tables';
import type { ElectricityBillInput, Phase } from './types';

export interface MeterDeps {
  readonly norms: NormTable;
  readonly tables: Pick<BillsTables, 'meter'>;
}

const RULES: readonly BillsRuleId[] = ['meter_rent'];

const monthly = (rent: MeterRent, phase: Phase): number =>
  phase === 'single' ? rent.singlePhase : rent.threePhase;

const above = (billed: number, cap: number): boolean => billed - cap > LINE_TOLERANCE + 1e-9;

// No norm sets a daily rent: the monthly price is brought to the days billed as its yearly
// equivalent (12 months) shared out by day, and the bill may charge up to it. A meter the person
// owns has no rent.
export function checkMeter(
  input: ElectricityBillInput,
  { norms, tables }: MeterDeps,
): BillItem | null {
  const meter = input.meter;
  if (meter === null) return null;
  const { to } = periodOf(input);
  const days = meter.days ?? periodDays(periodOf(input));
  const period = { from: addDays(to, -days), to };
  const cap = (phase: Phase) =>
    proratedOver(tables.meter, period, norms, (rent) => monthly(rent, phase) * 12);
  const singlePhase = cap('single');
  const threePhase = cap('three');
  if (singlePhase.kind === 'missing')
    return pendingOfficial('meter', singlePhase.day, RULES, norms);
  if (threePhase.kind === 'missing') return pendingOfficial('meter', threePhase.day, RULES, norms);

  const billed = billsPhrase('arithmetic.billed', { euros: { euros: meter.amount } });
  const finding = (
    status: BillFinding['status'],
    calculation: readonly BillsPhrase[],
    amount: number | null = null,
  ): BillFinding =>
    billFinding('meter', status, [...calculation, billed], RULES, norms, {
      amount,
      direction: amount === null ? null : 'over',
      recurring: status === 'above_regulated_price',
    });

  if (meter.owned === true)
    return acrossOfficial(singlePhase, () =>
      above(meter.amount, 0)
        ? finding('above_regulated_price', [billsPhrase('meter.owned')], round2(meter.amount))
        : finding('matches', [billsPhrase('meter.owned')]),
    );

  // The cap of the phase billed, else the supply's, else the higher of the two.
  const phase = meter.phase ?? meter.supplyPhase;
  const singleCap = Math.max(...officialValues(singlePhase.byBase).high);
  return acrossOfficial(phase === 'single' ? singlePhase : threePhase, (caps) => {
    const highest = Math.max(...caps);
    const capPhrase = billsPhrase('meter.cap', {
      phase: { integer: phase === 'single' ? 1 : 3 },
      days: { days },
      euros: { euros: round2(highest) },
    });
    if (above(meter.amount, highest))
      return finding('above_regulated_price', [capPhrase], round2(meter.amount - highest));
    if (meter.phase === 'three' && meter.supplyPhase === 'single')
      return finding('review_it', [capPhrase, billsPhrase('meter.three_phase_on_single')]);
    if (phase === null && above(meter.amount, singleCap))
      return finding('not_checkable', [capPhrase, billsPhrase('meter.phase_unknown')]);
    return finding('matches', [capPhrase]);
  });
}
