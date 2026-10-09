import { readdirSync, readFileSync } from 'node:fs';
import { expect } from 'vitest';
import type { CreditBankCase, CreditTemplateId } from '../../eval/credit-schema';
import type { EmploymentBankCase, EmploymentTemplateId } from '../../eval/employment-schema';
import type { InsuranceBankCase, InsuranceTemplateId } from '../../eval/insurance-schema';
import {
  PLACEHOLDER,
  SECTION,
  SHEET,
  type BankCase,
  type PageData,
  type TemplateId,
} from '../../eval/schema';

export const EVAL_DIR = new URL('../../eval/', import.meta.url);

// The cases of a bank's folder, in file name order.
function casesIn<C>(folder: string): readonly C[] {
  const dir = new URL(folder, EVAL_DIR);
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as C);
}

export const BANK: readonly BankCase[] = casesIn('cases/');

export const template = (id: TemplateId): string =>
  readFileSync(new URL(`templates/${id}.html`, EVAL_DIR), 'utf8');

export const sheetsOf = (id: TemplateId): number => template(id).match(SHEET)?.length ?? 0;

export const EMPLOYMENT_BANK: readonly EmploymentBankCase[] = casesIn('cases/employment/');

export const employmentTemplate = (id: EmploymentTemplateId): string =>
  readFileSync(new URL(`templates/${id}.html`, EVAL_DIR), 'utf8');

export const employmentSheetsOf = (id: EmploymentTemplateId): number =>
  employmentTemplate(id).match(SHEET)?.length ?? 0;

export const CREDIT_BANK: readonly CreditBankCase[] = casesIn('cases/credit/');
export const INSURANCE_BANK: readonly InsuranceBankCase[] = casesIn('cases/insurance/');

// A template of the credit or the insurance bank, named with its folder.
export const bankTemplate = (id: CreditTemplateId | InsuranceTemplateId): string =>
  readFileSync(new URL(`templates/${id}.html`, EVAL_DIR), 'utf8');

export const bankSheetsOf = (id: CreditTemplateId | InsuranceTemplateId): number =>
  bankTemplate(id).match(SHEET)?.length ?? 0;

// Cut every comment by position, so a nested or unclosed «<!--» never survives the cut.
export function withoutComments(html: string): string {
  let kept = '';
  let rest = html;
  for (let start = rest.indexOf('<!--'); start >= 0; start = rest.indexOf('<!--')) {
    kept += rest.slice(0, start);
    const end = rest.indexOf('-->', start + 4);
    rest = end < 0 ? '' : rest.slice(end + 3);
  }
  return kept + rest;
}

// The placeholders a template fills from the page itself, and those each repeated block fills
// from its rows.
export function placeholders(html: string): { page: string[]; lists: Map<string, string[]> } {
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

// Every placeholder of a template has a value in the page, row by row in repeated blocks.
export function expectFilled(id: string, html: string, data: PageData): void {
  const { page, lists } = placeholders(html);
  for (const key of page) expect(data, `${id}: ${key}`).toHaveProperty(key);
  for (const [name, rowKeys] of lists) {
    const rows = data[name];
    expect(Array.isArray(rows), `${id}: ${name}`).toBe(true);
    for (const row of Array.isArray(rows) ? rows : [])
      for (const key of rowKeys)
        expect(key in row || key in data, `${id}: ${name}.${key}`).toBe(true);
  }
}
