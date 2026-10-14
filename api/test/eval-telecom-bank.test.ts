import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/domain/documents';
import { TELECOM_MERGE_RULES } from '../src/domain/telecom-merge';
import { TELECOM_SECTIONS } from '../src/domain/telecom-schema';
import { FOOTER, SHEET } from '../eval/schema';
import {
  isTelecomTemplatePage,
  TELECOM_PERSON_KEYS,
  TELECOM_TEMPLATE_IDS,
  type TelecomBankCase,
} from '../eval/telecom-schema';
import {
  bankSheetsOf,
  bankTemplate,
  ELECTRICITY_BANK,
  expectFilled,
  TELECOM_BANK,
} from './support/bank';
import { expectOfType, specsOf } from './support/bank-values';

const templatesOf = (c: TelecomBankCase) =>
  c.pages.filter(isTelecomTemplatePage).map((p) => p.template);

const imagesOf = (c: TelecomBankCase) =>
  c.pages.reduce((n, p) => n + (isTelecomTemplatePage(p) ? bankSheetsOf(p.template) : 1), 0);

describe('the bank of telecom packs', () => {
  it('names each case after its file and gives it a rule to exercise', () => {
    const ids = TELECOM_BANK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of TELECOM_BANK) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.description, c.id).toMatch(/\bart\.|Ley|Real Decreto|\bRD\b|TRLGDCU/);
    }
  });

  it('holds 9 packs and marks four hard ones, which with the electricity bank make sixteen', () => {
    expect(TELECOM_BANK).toHaveLength(9);
    expect(TELECOM_BANK.filter((c) => c.eval)).toHaveLength(4);
    for (const c of TELECOM_BANK.filter((x) => x.expected.extraction.outcome === 'nothing_read'))
      expect(c.eval, c.id).toBe(true);
    expect(
      TELECOM_BANK.filter((c) => c.eval).length + ELECTRICITY_BANK.filter((c) => c.eval).length,
    ).toBe(16);
  });

  it('fits every pack in what the API accepts', () => {
    for (const c of TELECOM_BANK) expect(imagesOf(c), c.id).toBeLessThanOrEqual(LIMITS.maxImages);
  });

  it('gives every template placeholder a value, row by row in repeated blocks', () => {
    for (const c of TELECOM_BANK)
      for (const page of c.pages.filter(isTelecomTemplatePage))
        expectFilled(c.id, bankTemplate(page.template), page.data);
  });

  it('expects only fields the telecom response carries, each of its type', () => {
    const fields = new Set(Object.keys(TELECOM_MERGE_RULES));
    const specs = specsOf(TELECOM_SECTIONS, TELECOM_MERGE_RULES);
    for (const c of TELECOM_BANK) {
      for (const [name, value] of Object.entries(c.expected.extraction.fields)) {
        expect(fields, `${c.id}: ${name}`).toContain(name);
        expectOfType(`${c.id}: ${name}`, specs.fields[name], value);
      }
      for (const [name, rows] of Object.entries(c.expected.extraction.lists))
        for (const row of rows)
          for (const [key, value] of Object.entries(row))
            expectOfType(`${c.id}: ${name}.${key}`, specs.lists[name]?.[key], value);
    }
  });

  it('expects the contract and the penalty the engine is given', () => {
    for (const c of TELECOM_BANK.filter((x) => x.expected.extraction.outcome === 'ok')) {
      const { input, extraction } = c.expected;
      const { fields } = extraction;
      if (input.commitment === null) expect(fields['commitmentMonths'], c.id).toBeUndefined();
      else
        expect(fields, c.id).toMatchObject({
          commitmentStartsOn: input.commitment.startedOn,
          commitmentMonths: input.commitment.months,
          ...(input.commitment.agreedPenalty === null
            ? {}
            : { agreedPenalty: input.commitment.agreedPenalty }),
        });
      if (input.handset !== null) expect(fields['handsetValue'], c.id).toBe(input.handset.value);
      const penalties = (extraction.lists['lines'] ?? []).filter((l) => l['kind'] === 'penalty');
      const charged = penalties.reduce((sum, l) => sum + Number(l['amount']), 0);
      expect(Math.round(charged * 100) / 100, c.id).toBe(input.penaltyCharged ?? 0);
    }
  });

  it('covers the spread the review needs', () => {
    const inputs = TELECOM_BANK.map((c) => c.expected.input);
    const templates = TELECOM_BANK.flatMap(templatesOf);
    expect(templates).toContain('telecom/mobile-bill-es');
    expect(templates).toContain('telecom/fibre-bill-es');
    expect(inputs.some((i) => i.commitment !== null && i.changeNotice === null)).toBe(true);
    expect(inputs.some((i) => i.changeNotice?.index === 'none')).toBe(true);
    expect(inputs.some((i) => i.changeNotice?.index === 'ipc_plus')).toBe(true);
    expect(inputs.some((i) => i.handset?.kept === true)).toBe(true);
    expect(inputs.some((i) => (i.commitment?.months ?? 0) > 24)).toBe(true);
    const statuses = TELECOM_BANK.flatMap((c) =>
      c.expected.review.items.flatMap((i) =>
        'readings' in i ? i.readings.map((r) => `${r.id}:${r.status}`) : [`${i.id}:${i.status}`],
      ),
    );
    for (const s of [
      'commitment_penalty:paid_over',
      'commitment_penalty:within_limit',
      'change_exit:paid_over',
      'charge_after_exit:charged_after_exit',
      'commitment_length:above_legal_maximum',
    ])
      expect(statuses).toContain(s);
    expect(TELECOM_BANK.map((c) => c.expected.review.scope)).toContainEqual({
      inScope: false,
      reason: 'exit_before_2022',
    });
    expect(TELECOM_BANK.some((c) => c.expected.extraction.outcome === 'nothing_read')).toBe(true);
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(TELECOM_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))));
    for (const key of TELECOM_PERSON_KEYS) expect(keys).toContain(key);
  });
});

describe('the telecom templates', () => {
  it.each(TELECOM_TEMPLATE_IDS)(
    '%s says where it comes from and carries the footer on every sheet',
    (id) => {
      const html = bankTemplate(id);
      expect(html).toMatch(/^<!--[\s\S]*Source:[\s\S]*Licence:[\s\S]*-->/);
      const sheets = html.match(SHEET)?.length ?? 0;
      expect(sheets).toBeGreaterThanOrEqual(1);
      expect(html.split(FOOTER).length - 1).toBe(sheets);
    },
  );

  it('every template is used by some case', () => {
    const used = new Set(TELECOM_BANK.flatMap(templatesOf));
    for (const id of TELECOM_TEMPLATE_IDS) expect(used).toContain(id);
  });
});
