import { describe, expect, it } from 'vitest';
import { electricityLabels } from '../../../src/bills/electricity/render';
import { billFinding, type BillsItemId } from '../../../src/engine/bills/finding';
import type { Translate } from '../../../src/i18n/client';
import { juneBill } from '../../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../../engine/bills/norms-before-figure';

const tr: Translate = (key) => key;

const at = (id: BillsItemId, line: number | null) =>
  billFinding(id, 'matches', [], [], NORMS_BEFORE_FIGURE, { line });

describe('the labels of the electricity lines', () => {
  const input = juneBill({
    services: [{ label: 'insurance', amount: 3, requested: 'no' }],
  });
  const labels = electricityLabels(input, tr);

  it.each([
    ['power', 0, 'client.bills.item.power · client.bills.period.power.p1'],
    ['power', 1, 'client.bills.item.power · client.bills.period.power.p2'],
    ['power', 2, 'client.bills.item.power'],
    ['power', null, 'client.bills.item.power'],
    ['energy', 2, 'client.bills.item.energy · client.bills.period.energy.p3'],
    ['energy', 3, 'client.bills.item.energy'],
    ['service', 0, 'client.bills.item.service · client.bills.service.insurance'],
    ['service', 1, 'client.bills.item.service'],
    ['vat', 0, 'client.bills.item.vat'],
  ] as const)('names the line %s %s as %s', (id, line, title) => {
    expect(labels.title(at(id, line))).toBe(title);
  });

  it.each([
    ['vat', { tone: 'dates', number: '04' }],
    ['power', { tone: 'salary', number: '02' }],
    ['meter', { tone: 'settlement', number: '03' }],
    ['commitment_length', { tone: 'dates', number: '04' }],
  ] as const)('puts %s in the tab that asks for it', (id, expected) => {
    expect(labels.tone(id)).toEqual(expected);
  });
});
