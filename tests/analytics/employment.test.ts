import { describe, expect, it } from 'vitest';
import {
  CATALOGUE,
  EMPLOYMENT_ITEMS,
  EMPLOYMENT_TRACKABLE_FIELDS,
  HELP_TOPICS,
  SECTIONS,
  isValidEvent,
  type Track,
} from '../../src/analytics/events';
import { documentsAnalytics } from '../../src/analytics/documents';
import { employmentAnalytics, employmentReviewProps } from '../../src/analytics/employment';
import { EMPLOYMENT_FAQ_TOPICS } from '../../src/content/employment-faq-topics';
import { parseDate as f } from '../../src/engine/date';
import type { EmploymentInput } from '../../src/engine/employment/types';
import { SHEET_FIELDS, SHEETS } from '../../src/employment/form';
import { STEPS } from '../../src/employment/steps';
import {
  TODAY,
  belowMinimum,
  contract,
  review,
  unknownComplement,
  workOrService,
} from '../employment/fixtures';

const props = (
  input: EmploymentInput = belowMinimum,
  detail: 'locked' | 'unlocked' = 'unlocked',
  today = TODAY,
) =>
  employmentReviewProps({ review: review(input, today), input, attempt: 1, seconds: 95, detail });

describe('the catalogue follows the contract form', () => {
  it('every sheet, and the result, is a trackable section', () => {
    for (const step of STEPS) expect(SECTIONS).toContain(step);
    expect(new Set(SECTIONS).size).toBe(SECTIONS.length);
  });
  it('every question is a trackable field', () => {
    for (const sheet of SHEETS)
      for (const field of SHEET_FIELDS[sheet]) expect(EMPLOYMENT_TRACKABLE_FIELDS).toContain(field);
  });
  it('every question on the page is a help topic', () => {
    for (const [, anchor] of EMPLOYMENT_FAQ_TOPICS) expect(HELP_TOPICS).toContain(anchor);
    expect(new Set(HELP_TOPICS).size).toBe(HELP_TOPICS.length);
  });
});

describe('employment events', () => {
  it('accept the sheets, the fields, the reasons and the items', () => {
    expect(isValidEvent('section_viewed', { section: 'nominas' })).toBe(true);
    expect(isValidEvent('went_back', { from: 'oferta', to: 'relacion' })).toBe(true);
    expect(isValidEvent('validation_error', { section: 'relacion', field: 'startDate' })).toBe(
      true,
    );
    expect(isValidEvent('validation_error', { section: 'informacion', field: 'info_o' })).toBe(
      true,
    );
    expect(isValidEvent('validation_error', { section: 'nominas', field: 'payslips' })).toBe(true);
    expect(
      isValidEvent('validation_error', { section: 'nominas', field: 'payslips.0.salary' }),
    ).toBe(false);
    for (const reason of [
      'special_relationship',
      'public_servant',
      'temp_agency',
      'relief',
      'minor',
    ])
      expect(isValidEvent('employment_out_of_scope', { reason })).toBe(true);
    expect(isValidEvent('employment_out_of_scope', { reason: 'household' })).toBe(false);
    for (const item of EMPLOYMENT_ITEMS) expect(isValidEvent('detail_opened', { item })).toBe(true);
    expect(isValidEvent('detail_opened', { item: 'clause-0' })).toBe(false);
    expect(isValidEvent('detail_opened', { item: 'Pacto de no competencia' })).toBe(false);
    expect(isValidEvent('help_opened', { topic: 'faq-contrato-prueba' })).toBe(true);
  });

  it('a whole review leaves as codes and buckets', () => {
    const p = props();
    expect(isValidEvent('employment_review_completed', p)).toBe(true);
    expect(p).toMatchObject({
      start_period: '2026+',
      modality: 'permanent',
      part_time: false,
      written: 'yes',
      smi: 'below_minimum',
      modality_check: 'within_limit',
      chaining: 'none',
      smi_years_below: '1',
      smi_not_published: false,
      payslips: '0',
      history: false,
      offer: false,
      agreement_named: false,
      // 994 € short in 2026, counted up to 8 October.
      difference: '500-2000',
      offered: true,
      detail: 'unlocked',
      attempt: '1',
      seconds: '60-180',
    });
    expect(Object.keys(p).toSorted()).toEqual(
      Object.keys(CATALOGUE.employment_review_completed).toSorted(),
    );
  });

  it('names a point that depends on a «No lo sé» as readings, with no difference from it', () => {
    const p = props(unknownComplement);
    expect(p.smi).toBe('readings');
    expect(p.difference).toBe('0');
    expect(p.smi_years_below).toBe('0');
    expect(isValidEvent('employment_review_completed', p)).toBe(true);
  });

  it('a work-or-service contract after the reform reads as becoming permanent', () => {
    const p = props(workOrService);
    expect(p.modality).toBe('work_or_service');
    expect(p.modality_check).toBe('becomes_permanent');
    expect(p.start_period).toBe('2022-2023');
  });

  it('sorts the contract by the 2021 reform and the years after it', () => {
    const period = (day: string) =>
      props(contract({ startDate: f(day), signedOn: null })).start_period;
    expect(period('2021-06-01')).toBe('before_reform');
    expect(period('2022-03-29')).toBe('before_reform');
    expect(period('2022-03-30')).toBe('2022-2023');
    expect(period('2024-01-01')).toBe('2024-2025');
    expect(period('2026-01-01')).toBe('2026+');
  });

  it('marks a year whose minimum wage is not out yet', () => {
    const p = props(
      contract({ startDate: f('2026-11-02'), signedOn: null }),
      'unlocked',
      f('2027-01-20'),
    );
    expect(p.smi_not_published).toBe(true);
    expect(isValidEvent('employment_review_completed', p)).toBe(true);
  });

  it('counts payslips in a bucket and says whether a history, an offer or an agreement were given', () => {
    const p = props(
      contract({
        payslips: Array.from({ length: 5 }, (_, i) => ({
          month: `2026-0${i + 1}`,
          wholeMonth: true,
          incidents: false,
          salaryInMoney: 1500,
          inKind: 0,
          proratedExtraPay: 0,
          overtimeHours: null,
          complementaryHours: null,
        })),
        history: [],
        offer: { grossAnnual: null, net: false, weeklyHours: null, modality: null, remote: null },
        agreement: {
          named: true,
          categoryAnnualSalary: null,
          annualHours: null,
          holidayDays: null,
          trialMonths: null,
        },
      }),
    );
    expect(p).toMatchObject({ payslips: '4+', history: true, offer: true, agreement_named: true });
  });

  it('refuses euros, a date or free text in any key', () => {
    const p = props();
    for (const key of Object.keys(p))
      for (const value of [
        994,
        '994,00 €',
        '994.00',
        '17094',
        '2026-01-01',
        '01-01-2026',
        'Convenio de oficinas y despachos',
        'Empresa Ficticia, S.L.',
        ['2026'],
      ])
        expect(isValidEvent('employment_review_completed', { ...p, [key]: value }), key).toBe(
          false,
        );
    expect(isValidEvent('employment_review_completed', { ...p, salary: '1150' })).toBe(false);
    expect(isValidEvent('employment_review_completed', { ...p, agreement: 'oficinas' })).toBe(
      false,
    );
  });

  it('employmentAnalytics names each event as the catalogue does', () => {
    const sent: [string, Record<string, unknown>][] = [];
    let clock = 0;
    const events = employmentAnalytics(
      ((name: string, p: Record<string, unknown>) => {
        expect(isValidEvent(name, p), name).toBe(true);
        sent.push([name, p]);
      }) as Track,
      () => clock,
    );
    events.stepShown('relacion');
    events.stepShown('relacion');
    clock = 12_000;
    events.fieldRejected('relacion', 'startDate');
    events.stepCompleted('relacion');
    events.stepShown('modalidad');
    events.wentBack('modalidad', 'relacion');
    events.outOfScope('temp_agency');
    events.helpOpened('faq-contrato-smi');
    events.detailOpened('minimum_wage');
    clock = 100_000;
    events.reviewCompleted({ review: review(belowMinimum), input: belowMinimum, detail: 'locked' });
    events.reviewCompleted({ review: review(belowMinimum), input: belowMinimum, detail: 'locked' });
    events.startedOver();
    expect(sent.map(([n]) => n)).toEqual([
      'section_viewed',
      'validation_error',
      'section_completed',
      'section_viewed',
      'went_back',
      'employment_out_of_scope',
      'help_opened',
      'detail_opened',
      'employment_review_completed',
      'employment_review_completed',
      'started_over',
    ]);
    expect(sent[2]?.[1]).toEqual({ section: 'relacion', seconds: '10-30' });
    expect(sent[5]?.[1]).toEqual({ reason: 'temp_agency' });
    expect(sent[8]?.[1]).toMatchObject({ attempt: '1', seconds: '60-180', detail: 'locked' });
    expect(sent[9]?.[1]).toMatchObject({ attempt: '2' });
  });

  it('a download names the contract letters by their kind', () => {
    for (const kind of ['information_request', 'employment', 'temporary_contracts_certificate'])
      expect(
        isValidEvent('report_downloaded', {
          document: 'letter',
          letter_prefilled: 'some',
          letter_kind: kind,
        }),
        kind,
      ).toBe(true);
    expect(
      isValidEvent('report_downloaded', {
        document: 'letter',
        letter_prefilled: 'some',
        letter_kind: 'Empresa Ficticia, S.L.',
      }),
    ).toBe(false);
  });

  it('the contract page measures its reads with the same document events', () => {
    const sent: string[] = [];
    const events = documentsAnalytics(((name: string, p: unknown) => {
      expect(isValidEvent(name, p), name).toBe(true);
      sent.push(name);
    }) as Track);
    events.extractionCompleted({
      kinds: ['employment_contract', 'payslip', 'work_history', 'job_offer'],
      fields: 12,
      lowConfidence: false,
      failedChecks: false,
      conflicts: false,
      escalated: false,
      skippedReasons: ['not_labour_document'],
    });
    events.nothingRead(['not_labour_document'], '1', 0);
    expect(sent).toEqual(['extraction_completed', 'nothing_read']);
  });
});
