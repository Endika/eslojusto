// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { EmploymentExtraction } from '../../src/documents/contract';
import { employmentReading } from '../../src/employment/reading';
import { tr } from './fixtures';

const f = (value: string) =>
  ({ value, confidence: 'high', source: 'employment_contract' }) as const;

const extraction = (fields: EmploymentExtraction['fields']): EmploymentExtraction => ({
  pages: [],
  documents: [{ kind: 'employment_contract', pages: 2 }],
  fields,
  conflicts: [],
  salaryParts: [],
  clauses: [],
  information: [],
  relationshipHints: [],
  payslips: [],
  lines: [],
  contracts: [],
});

function form(): HTMLFormElement {
  const el = document.createElement('form');
  el.innerHTML = `
    <input type="hidden" name="agreementName" data-read-agreement="name" />
    <input type="hidden" name="agreementCode" data-read-agreement="code" />`;
  document.body.append(el);
  return el;
}

const values = (el: HTMLFormElement) => {
  const data = new FormData(el);
  return { name: data.get('agreementName'), code: data.get('agreementCode') };
};

describe('the agreement a reading keeps for the result', () => {
  it('keeps what the contract named, and a later read without it does not clear it', () => {
    const el = form();
    const reading = employmentReading(el, tr);
    reading.prefill(
      extraction({ agreementName: f('Convenio del metal'), agreementCode: f('99000000011999') }),
      {},
      [],
    );
    expect(values(el)).toEqual({ name: 'Convenio del metal', code: '99000000011999' });
    reading.prefill(extraction({}), {}, []);
    expect(values(el)).toEqual({ name: 'Convenio del metal', code: '99000000011999' });
  });

  it('empties it when the person starts over', () => {
    const el = form();
    employmentReading(el, tr).prefill(
      extraction({ agreementName: f('Convenio del metal') }),
      {},
      [],
    );
    el.reset();
    expect(values(el)).toEqual({ name: '', code: '' });
  });
});
