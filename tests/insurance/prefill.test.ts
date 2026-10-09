// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  Confidence,
  ExtractedValue,
  InsuranceExtraction,
  SourceKind,
} from '../../src/documents/contract';
import { parseDate } from '../../src/engine/date';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { readInsuranceForm } from '../../src/insurance/form';
import { insurancePrefill } from '../../src/insurance/prefill';

const tr: Translate = (key, vars) => t('es', key, vars);
const TODAY = parseDate('2026-10-09');

const f = (
  value: ExtractedValue,
  confidence: Confidence = 'high',
  source: SourceKind = 'insurance_policy',
) => ({ value, confidence, source });
const notice = (value: ExtractedValue, confidence: Confidence = 'high') =>
  f(value, confidence, 'insurance_renewal_notice');

const extraction = (e: Partial<InsuranceExtraction>): InsuranceExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  sumsInsured: [],
  ...e,
});

const prefill = (
  e: Partial<InsuranceExtraction>,
  checks: Parameters<typeof insurancePrefill>[2] = [],
) => insurancePrefill(extraction(e), tr, checks);
type P = ReturnType<typeof prefill>;
const entry = (p: P, name: string) => p.entries.find(([n]) => n === name)?.[1];
const mark = (p: P, id: string) => p.marks.find((m) => m.id === id);

// A synthetic home policy taken out online, and the notice of its renewal with a higher premium.
const POLICY: InsuranceExtraction['fields'] = {
  line: f('home'),
  insurerName: f('Aseguradora Ficticia, S.A.'),
  concludedOn: f('2025-11-20'),
  effectiveOn: f('2025-12-01'),
  expiresOn: f('2026-12-01'),
  renews: f(true),
  premiumTotal: f(300),
  channel: f('online'),
  nonRenewalClauseText: f(
    'El contrato se prorrogará por periodos anuales salvo que una de las partes se oponga a la prórroga.',
  ),
};
const NOTICE: InsuranceExtraction['fields'] = {
  noticeOn: notice('2026-09-20'),
  noticeMedium: notice('email'),
  previousPremium: notice(300),
  newPremium: notice(345),
  coverChanges: notice(true, 'medium'),
  changesText: notice('La franquicia de daños por agua pasa a ser de 150 €.'),
};

describe('a policy', () => {
  const p = prefill({ fields: POLICY });

  it('fills its line, its renewal, its end date and the day it was taken out', () => {
    expect(entry(p, 'line')).toBe('home');
    expect(entry(p, 'renews')).toBe('yes');
    expect(entry(p, 'expiresOn')).toBe('2026-12-01');
    expect(entry(p, 'concludedOn')).toBe('2025-11-20');
  });

  it('works out that it was taken out at a distance from how, never more than fairly sure', () => {
    expect(entry(p, 'distance')).toBe('yes');
    expect(mark(p, 'distance')).toMatchObject({ confidence: 'medium', derived: true });
    expect(entry(prefill({ fields: { channel: f('in_person') } }), 'distance')).toBe('no');
    expect(entry(prefill({ fields: { channel: f('other') } }), 'distance')).toBeUndefined();
  });

  it('quotes its clause on renewal beside the question', () => {
    expect(p.quotes.renews).toMatch(/^El contrato se prorrogará/);
  });

  it('opens no notice without one', () => {
    expect(entry(p, 'hasNotice')).toBeUndefined();
    expect(entry(p, 'previousPremium')).toBeUndefined();
  });

  it('asks a car policy for its cover, and a home one never', () => {
    const car = prefill({ fields: { line: f('car'), carCover: f('with_voluntary') } });
    expect(entry(car, 'carCover')).toBe('with_voluntary');
    expect(
      entry(prefill({ fields: { ...POLICY, carCover: f('compulsory_only') } }), 'carCover'),
    ).toBeUndefined();
  });
});

describe('a renewal notice', () => {
  const p = prefill({ fields: { ...POLICY, ...NOTICE } });

  it('opens the notice and fills its premiums and whether covers change', () => {
    expect(entry(p, 'hasNotice')).toBe('yes');
    expect(entry(p, 'previousPremium')).toBe('300,00');
    expect(entry(p, 'newPremium')).toBe('345,00');
    expect(entry(p, 'changes')).toBe('yes');
    expect(p.quotes.changes).toBe('La franquicia de daños por agua pasa a ser de 150 €.');
  });

  it('takes the notice’s own date as the day it arrived only to be checked, and says so', () => {
    expect(entry(p, 'noticeReceivedOn')).toBe('2026-09-20');
    expect(mark(p, 'noticeReceivedOn')).toMatchObject({ confidence: 'low', derived: true });
    expect(p.notes).toContain(t('es', 'client.insurance.documents.notice_date'));
  });

  it('gives answers the form reads into the engine’s input once the person adds the rest', () => {
    const el = document.createElement('form');
    const values = {
      ...Object.fromEntries(p.entries),
      mortgageRequired: 'no',
      policyReceived: 'unknown',
    };
    el.innerHTML = Object.entries(values)
      .map(([name, value]) => `<input name="${name}" value="${value}" />`)
      .join('');
    expect(readInsuranceForm(el, TODAY)).toMatchObject({
      input: {
        line: 'home',
        expiresOn: parseDate('2026-12-01'),
        distance: true,
        notice: {
          receivedOn: parseDate('2026-09-20'),
          previousPremium: 300,
          newPremium: 345,
          changes: true,
        },
      },
    });
  });
});

describe('the summary', () => {
  it('names the end date when the policy and the notice state it differently', () => {
    const p = prefill({
      fields: { ...POLICY, ...NOTICE },
      conflicts: [
        { field: 'expiresOn', sources: ['insurance_renewal_notice', 'insurance_policy'] },
      ],
    });
    expect(p.notes[0]).toBe(
      'Fecha de vencimiento de la póliza: los documentos no dicen lo mismo. Se ha usado lo que pone el aviso de renovación; compáralo con los demás.',
    );
  });

  it('words each check of the API', () => {
    const p = prefill({ fields: POLICY }, ['premium_parts_do_not_sum']);
    expect(p.notes).toEqual([t('es', 'client.insurance.documents.check.premium_parts_do_not_sum')]);
  });
});
