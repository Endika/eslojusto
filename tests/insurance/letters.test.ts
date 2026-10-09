import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { INSURANCE_NORMS } from '../../src/engine/insurance/data/norms';
import { reviewInsurance } from '../../src/engine/insurance/review';
import type { InsuranceInput } from '../../src/engine/insurance/types';
import { NO_DETAILS, type LetterDetails } from '../../src/documents/letter';
import { renderPdf } from '../../src/documents/pdf';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { insuranceCase } from '../../src/insurance/case';
import { insuranceLetterKinds, nonRenewalLetter } from '../../src/insurance/letters';
import type { CompletedInsuranceReview } from '../../src/insurance/ports';
import { FORBIDDEN, forbiddenIn } from '../support/forbidden';
import { notice, policy, TODAY } from '../engine/insurance/input';

const tr: Translate = (key, vars) => t('es', key, vars);

const completed = (input: InsuranceInput, today = TODAY): CompletedInsuranceReview => {
  const r = reviewInsurance(input, today, { norms: INSURANCE_NORMS });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { input, review: r.review };
};

const text = (model: DocumentModel) =>
  model.blocks
    .map((b: Block) =>
      'text' in b
        ? b.text
        : 'label' in b
          ? `${b.label} ${'value' in b ? (b.value ?? '') : ''}`
          : '',
    )
    .join('\n')
    .replace(/[\u00a0\u202f]/g, ' ');

const DETAILS: LetterDetails = {
  ...NO_DETAILS,
  name: 'Alex Ejemplo',
  company: 'Aseguradora Ficticia, S.A.',
  reference: 'HOG-0000-TEST',
  place: 'Soria',
  date: parseDate('2026-10-09'),
};

describe('the letter that says the policy is not to be extended', () => {
  it('is offered free while there is still time to send it', () => {
    expect(insuranceLetterKinds(completed(policy()))).toEqual(['insurance_non_renewal']);
    // Expiring on 01-11-2026, the last day was 01-10-2026.
    expect(insuranceLetterKinds(completed(policy({ expiresOn: parseDate('2026-11-01') })))).toEqual(
      [],
    );
    expect(insuranceLetterKinds(completed(policy({ renews: false })))).toEqual([]);
    expect(insuranceLetterKinds(completed(policy({ line: 'life' })))).toEqual([]);
  });

  it('is offered on the last day too', () => {
    expect(insuranceLetterKinds(completed(policy({ expiresOn: parseDate('2026-11-09') })))).toEqual(
      ['insurance_non_renewal'],
    );
  });

  it('names the policy, its expiry and art. 22.2, and asks for a receipt', () => {
    const model = nonRenewalLetter(completed(policy()), DETAILS, tr);
    const all = text(model);
    expect(model.title).toBe('Comunicación de que no prorrogo mi póliza');
    expect(all).toContain(
      'Te comunico que no deseo prorrogar mi póliza de seguro de hogar, cuyo periodo en curso vence el 01-03-2027.',
    );
    expect(all).toContain('Ley de Contrato de Seguro, art. 22.2');
    expect(all).toContain('al menos un mes de antelación');
    expect(all).toContain('Te pido que me confirmes por escrito que la has recibido.');
    expect(model.blocks).toContainEqual({
      type: 'blank',
      label: 'Número de póliza',
      value: 'HOG-0000-TEST',
      wrap: true,
    });
    expect(model.blocks.at(-1)).toEqual({
      type: 'blank',
      label: 'Nombre y apellidos',
      value: 'Alex Ejemplo',
      wrap: true,
    });
  });

  it('words a motor policy as such', () => {
    const all = text(
      nonRenewalLetter(
        completed(policy({ line: 'car', carCover: 'with_voluntary', mortgageRequired: null })),
        NO_DETAILS,
        tr,
      ),
    );
    expect(all).toContain('mi póliza de seguro del coche');
  });

  // The last day stays on the result with its notes: the month-end reading and a period ending at
  // 00:00 h are interpretations, not facts to tell the insurer.
  it('never tells the insurer a last day', () => {
    const all = text(
      nonRenewalLetter(completed(policy({ expiresOn: parseDate('2027-03-31') })), NO_DETAILS, tr),
    );
    expect(all).not.toContain('28-02-2027');
  });
});

describe('the insurance review as the pass sees it', () => {
  it('never offers the pass, and gives the free letter and a report for a pass already held', async () => {
    const r = completed(policy({ notice: notice() }));
    const c = insuranceCase(r);
    expect(c).toMatchObject({
      offer: false,
      letterKinds: [],
      freeLetterKinds: ['insurance_non_renewal'],
    });
    expect(c.filename?.('report')).toBe('client.insurance.report.filename');
    expect(c.filename?.('letter', 'insurance_non_renewal')).toBe(
      'client.insurance.letter.filename',
    );
    const report = c.report(tr, TODAY);
    const all = text(report);
    expect(report.title).toBe('Revisión de las fechas de tu seguro');
    expect(all).toContain('Comunicar que no renuevas');
    expect(all).toContain('Tu prima sube un 15 % (45,00 €)');
    expect(all).toContain('Lo que esta revisión no comprueba');
    for (const model of [report, c.letter('insurance_non_renewal', DETAILS, tr)]) {
      expect(forbiddenIn('client.insurance.', text(model))).toEqual([]);
      for (const forbidden of FORBIDDEN) expect(text(model).toLowerCase()).not.toMatch(forbidden);
      expect((await renderPdf(model)).length).toBeGreaterThan(1000);
    }
  });
});
