import { readdirSync, readFileSync } from 'node:fs';
import type { EmploymentBankCase, EmploymentTemplateId } from '../../eval/employment-schema';
import { SHEET, type BankCase, type TemplateId } from '../../eval/schema';

export const EVAL_DIR = new URL('../../eval/', import.meta.url);

export const BANK: readonly BankCase[] = readdirSync(new URL('cases/', EVAL_DIR))
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(`cases/${name}`, EVAL_DIR), 'utf8')) as BankCase);

export const template = (id: TemplateId): string =>
  readFileSync(new URL(`templates/${id}.html`, EVAL_DIR), 'utf8');

export const sheetsOf = (id: TemplateId): number => template(id).match(SHEET)?.length ?? 0;

export const EMPLOYMENT_BANK: readonly EmploymentBankCase[] = readdirSync(
  new URL('cases/employment/', EVAL_DIR),
)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map(
    (name) =>
      JSON.parse(
        readFileSync(new URL(`cases/employment/${name}`, EVAL_DIR), 'utf8'),
      ) as EmploymentBankCase,
  );

export const employmentTemplate = (id: EmploymentTemplateId): string =>
  readFileSync(new URL(`templates/${id}.html`, EVAL_DIR), 'utf8');

export const employmentSheetsOf = (id: EmploymentTemplateId): number =>
  employmentTemplate(id).match(SHEET)?.length ?? 0;

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
