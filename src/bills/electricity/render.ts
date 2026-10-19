import { find } from '../../calculator/review-result';
import type { ElectricityReview } from '../../engine/bills/electricity-review';
import type { BillFinding, BillsItemId } from '../../engine/bills/finding';
import type { NormTable } from '../../engine/bills/norms';
import type { ElectricityBillInput } from '../../engine/bills/types';
import type { Translate } from '../../i18n/client';
import {
  renderItems,
  renderTotals,
  renderUnchecked,
  showInScope,
  summaryKind,
  type ItemLabels,
  type Tone,
} from '../result';
import { SECTION_OF_STEP, type Step, type Tab } from './steps';

// Each line goes with the tab that asks for its figures.
const STEP_OF: Partial<Record<BillsItemId, Step>> = {
  days: 'lecturas',
  power: 'potencia-punta',
  energy: 'energia-punta',
  total: 'total',
  tolls_and_charges_power: 'peajes',
  tolls_and_charges_energy: 'peajes',
  pvpc_eligibility: 'mercado',
  pvpc_power_p1: 'potencia-punta',
  pvpc_power_p2: 'potencia-valle',
  social_bonus_funding: 'financiacion',
  meter: 'contador',
  social_bonus: 'bono-social',
  electricity_tax: 'impuesto-electrico',
  vat: 'iva',
  excess_power: 'exceso',
  service: 'servicios',
  exit_penalty: 'penalizacion',
  power_used: 'potencia-maxima',
};
const TAB_NUMBER: Record<Tab, string> = {
  cause: '01',
  salary: '02',
  settlement: '03',
  dates: '04',
  result: '05',
};

const tone = (id: BillsItemId): Tone => {
  const tab = SECTION_OF_STEP[STEP_OF[id] ?? 'total'];
  return { tone: tab, number: TAB_NUMBER[tab] };
};

// «Término de energía · P2», «Servicio · Mantenimiento»: the line a finding is about, from the
// answers it was worked out from.
export function electricityLabels(input: ElectricityBillInput, tr: Translate): ItemLabels {
  const lineName = (f: BillFinding): string | null => {
    if (f.line === null) return null;
    if (f.id === 'power') {
      const p = input.power[f.line]?.period;
      return p === undefined ? null : tr(`client.bills.period.power.${p}`);
    }
    if (f.id === 'energy') {
      const p = input.energy[f.line]?.period;
      return p === undefined ? null : tr(`client.bills.period.energy.${p}`);
    }
    if (f.id === 'service') {
      const s = input.services[f.line];
      return s === undefined ? null : tr(`client.bills.service.${s.label}`);
    }
    return null;
  };
  return {
    title(f) {
      const name = tr(`client.bills.item.${f.id}`);
      const line = lineName(f);
      return line === null ? name : `${name} · ${line}`;
    },
    tone,
  };
}

// The totals first, then every line with its verdict, calculation, rules and table rows, and what
// the review does not look at. With the pass offered for the year and not held, a bill that counts
// something over the norm does not say which lines: their cards are not in the page at all, and the
// totals, exact, name none.
export function renderElectricityResult(
  root: HTMLElement,
  review: ElectricityReview,
  input: ElectricityBillInput,
  norms: NormTable,
  passToBuy: boolean,
  tr: Translate,
): void {
  showInScope(root);
  const kind = summaryKind(review.items, review.totals);
  const unnamed = passToBuy && kind === 'over';
  find(root, '[data-lead]').textContent = tr(
    unnamed ? 'client.bills.result.lead_unnamed' : `client.bills.result.lead_${kind}`,
  );
  renderTotals(root, review.totals, tr);
  find(root, '[data-recurring]').hidden = !review.recurring;
  renderItems(root, unnamed ? [] : review.items, norms, electricityLabels(input, tr), tr);
  renderUnchecked(
    root,
    review.unchecked.map((code) => tr(`client.bills.unchecked.electricity.${code}`)),
  );
}
