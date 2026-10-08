import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_SECTIONS } from '../src/domain/employment-schema';
import {
  EMPLOYMENT_PERSON_KEYS,
  EMPLOYMENT_TEMPLATE_IDS,
  isEmploymentTemplatePage,
  type EmploymentBankCase,
} from '../eval/employment-schema';
import { FOOTER, PLACEHOLDER, SECTION, SHEET } from '../eval/schema';
import { EMPLOYMENT_BANK, employmentTemplate, withoutComments } from './support/bank';

// The placeholders a template fills from the page itself, and those each repeated block fills
// from its rows.
function placeholders(html: string): { page: string[]; lists: Map<string, string[]> } {
  const lists = new Map<string, string[]>();
  const rest = withoutComments(html).replace(SECTION, (_, name: string, block: string) => {
    lists.set(
      name,
      [...block.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''),
    );
    return '';
  });
  return { page: [...rest.matchAll(PLACEHOLDER)].map((m) => m[1] ?? ''), lists };
}

const templatesOf = (c: EmploymentBankCase) =>
  c.pages.filter(isEmploymentTemplatePage).map((p) => p.template);

describe('the bank of employment packs', () => {
  it('names each case after its file and gives it a rule to exercise', () => {
    const ids = EMPLOYMENT_BANK.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of EMPLOYMENT_BANK) {
      expect(c.id).toMatch(/^[a-z0-9-]+$/);
      expect(c.description, c.id).toMatch(/\bET\b|RD|RDL|Ley|art\./);
    }
  });

  it('marks fifteen hard packs for the AI pass, the unreadable ones among them', () => {
    const hard = EMPLOYMENT_BANK.filter((c) => c.eval);
    expect(hard).toHaveLength(15);
    for (const c of EMPLOYMENT_BANK.filter((x) => x.expected.extraction.outcome === 'nothing_read'))
      expect(c.eval, c.id).toBe(true);
  });

  it('gives every template placeholder a value, row by row in repeated blocks', () => {
    for (const c of EMPLOYMENT_BANK)
      for (const page of c.pages.filter(isEmploymentTemplatePage)) {
        const { page: keys, lists } = placeholders(employmentTemplate(page.template));
        for (const key of keys) expect(page.data, `${c.id}: ${key}`).toHaveProperty(key);
        for (const [name, rowKeys] of lists) {
          const rows = page.data[name];
          expect(Array.isArray(rows), `${c.id}: ${name}`).toBe(true);
          for (const row of Array.isArray(rows) ? rows : [])
            for (const key of rowKeys)
              expect(key in row || key in page.data, `${c.id}: ${name}.${key}`).toBe(true);
        }
      }
  });

  it('expects only fields and lists the employment schema has', () => {
    const offer = (name: string) => `offer${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    const fields = new Set([
      ...Object.keys(EMPLOYMENT_SECTIONS.employment_contract.fields),
      ...Object.keys(EMPLOYMENT_SECTIONS.job_offer.fields).map(offer),
    ]);
    const lists = Object.fromEntries(
      Object.values(EMPLOYMENT_SECTIONS).flatMap((s) =>
        Object.entries(s.lists).map(([name, spec]) => [name, new Set(Object.keys(spec.item))]),
      ),
    );
    for (const c of EMPLOYMENT_BANK) {
      for (const name of Object.keys(c.expected.extraction.fields))
        expect(fields, `${c.id}: ${name}`).toContain(name);
      for (const [name, rows] of Object.entries(c.expected.extraction.lists))
        for (const row of rows)
          for (const key of Object.keys(row))
            expect(lists[name], `${c.id}: ${name}.${key}`).toContain(key);
    }
  });

  it('covers the spread the review needs', () => {
    const inputs = EMPLOYMENT_BANK.map((c) => c.expected.input);
    const modalities = new Set(inputs.map((i) => i.modality));
    for (const m of [
      'permanent',
      'discontinuous',
      'production',
      'production_occasional',
      'replacement',
      'training_alternance',
      'training_practice',
      'work_or_service',
      'eventual',
    ])
      expect(modalities).toContain(m);
    expect(inputs.some((i) => i.partTime?.complementary?.percent === 40)).toBe(true);
    expect(inputs.some((i) => i.contractHours.weekly === 20 && i.partTime !== null)).toBe(true);
    expect(inputs.some((i) => i.payslips.length === 6 && i.payslips.some((p) => p.incidents))).toBe(
      true,
    );
    expect(inputs.some((i) => i.history?.some((p) => p.startDate.startsWith('2021')))).toBe(true);
    expect(inputs.some((i) => i.offer?.net === true)).toBe(true);
    const labels = new Set(inputs.flatMap((i) => i.clauses.map((c) => c.label)));
    for (const label of ['non_compete', 'waiver', 'remote_work_costs', 'retention', 'exclusivity'])
      expect(labels).toContain(label);
    const scopes = EMPLOYMENT_BANK.map((c) => c.expected.review.scope);
    expect(scopes).toEqual(
      expect.arrayContaining([
        { inScope: false, reason: 'special_relationship' },
        { inScope: false, reason: 'temp_agency' },
        { inScope: true, partial: true, reason: 'before_reform' },
      ]),
    );
    const templates = EMPLOYMENT_BANK.flatMap(templatesOf);
    expect(templates.filter((t) => !t.endsWith('-es')).length).toBeGreaterThanOrEqual(2);
    expect(
      EMPLOYMENT_BANK.filter((c) => c.pages.some((p) => !isEmploymentTemplatePage(p))).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      EMPLOYMENT_BANK.filter((c) => c.expected.extraction.outcome === 'nothing_read').length,
    ).toBeGreaterThanOrEqual(2);
  });

  it('keeps the person keys it scans for in the AI pass', () => {
    const keys = new Set(
      EMPLOYMENT_BANK.flatMap((c) => c.pages.flatMap((p) => Object.keys(p.data))),
    );
    for (const key of EMPLOYMENT_PERSON_KEYS) expect(keys).toContain(key);
  });
});

describe('the employment templates', () => {
  it.each(EMPLOYMENT_TEMPLATE_IDS)(
    '%s says where it comes from and carries the footer on every sheet',
    (id) => {
      const html = employmentTemplate(id);
      expect(html).toMatch(/^<!--[\s\S]*Source:[\s\S]*Licence:[\s\S]*-->/);
      const sheets = html.match(SHEET)?.length ?? 0;
      expect(sheets).toBeGreaterThanOrEqual(1);
      expect(html.split(FOOTER).length - 1).toBe(sheets);
    },
  );

  it('every template is used by some case', () => {
    const used = new Set(EMPLOYMENT_BANK.flatMap(templatesOf));
    for (const id of EMPLOYMENT_TEMPLATE_IDS) expect(used).toContain(id);
  });
});
