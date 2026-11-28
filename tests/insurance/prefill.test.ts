// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
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
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('insurance');
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
  let p: P;
  beforeEach(() => {
    p = prefill({ fields: POLICY });
  });

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
    expect(mark(prefill({ fields: { channel: f('other') } }), 'distance')).toBeUndefined();
    expect(entry(prefill({ fields: { channel: f('other') } }), 'distance')).toBeUndefined();
  });

  it('quotes its clause on renewal beside the question', () => {
    expect(p.quotes.renews).toMatch(/^El contrato se prorrogará/);
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
  let p: P;
  beforeEach(() => {
    p = prefill({ fields: { ...POLICY, ...NOTICE } });
  });

  it('takes the notice’s own date as the day it arrived only to be checked, and says so', () => {
    expect(entry(p, 'noticeReceivedOn')).toBe('2026-09-20');
    expect(mark(p, 'noticeReceivedOn')).toMatchObject({ confidence: 'low', derived: true });
    expect(p.notes).toContain(t('es', 'client.insurance.documents.notice_date'));
    // That date is low on purpose and has its own note: alone it does not call the read doubtful.
    expect(p.lowConfidence).toBe(false);
    expect(p.notes).not.toContain(t('es', 'client.documents.done_low'));
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

describe('what a reading is worth', () => {
  it('lists every answer with where to find it, and marks only what was worked out', () => {
    const p = prefill({ fields: { line: f('home'), channel: f('online'), renews: f(false) } });
    expect(p.marks).toEqual([
      { id: 'line', container: '[data-field="line"]', confidence: 'high' },
      { id: 'renews', container: '[data-field="renews"]', confidence: 'high' },
      { id: 'distance', container: '[data-field="distance"]', confidence: 'medium', derived: true },
    ]);
    expect(p.entries).toEqual([
      ['line', 'home'],
      ['renews', 'no'],
      ['distance', 'yes'],
    ]);
    expect(p.count).toBe(3);
  });

  it.each([['in_person', 'low', 'low']] as const)(
    'reads a %s channel of %s confidence as %s',
    (channel, confidence, expected) => {
      expect(
        mark(prefill({ fields: { channel: f(channel, confidence) } }), 'distance')?.confidence,
      ).toBe(expected);
    },
  );

  it.each([['a cent', 0.01, '0,01']])('fills the new premium from %s', (_, value, expected) => {
    expect(entry(prefill({ fields: { newPremium: notice(value) } }), 'newPremium')).toBe(expected);
  });

  it.each([['zero', 0]])('leaves a premium that is %s unanswered', (_, value) => {
    const p = prefill({
      fields: {
        noticeOn: notice('2026-09-20'),
        previousPremium: notice(value),
        newPremium: notice(value),
      },
    });
    expect(p.entries.map(([name]) => name)).toEqual(['hasNotice', 'noticeReceivedOn']);
  });

  it.each([
    ['a previous premium', { previousPremium: notice(300) }],
    ['whether covers change', { coverChanges: notice(false) }],
  ])('opens the notice for %s alone', (_, fields) => {
    expect(entry(prefill({ fields }), 'hasNotice')).toBe('yes');
  });

  it('only notes the notice date when there is one', () => {
    const p = prefill({ fields: { newPremium: notice(345) } });
    expect(entry(p, 'noticeReceivedOn')).toBeUndefined();
    expect(p.notes).toEqual([]);
  });

  it('asks nothing of a car cover that was not read', () => {
    expect(entry(prefill({ fields: { line: f('car') } }), 'carCover')).toBeUndefined();
  });

  it('quotes the clauses trimmed, and none that is blank or not text', () => {
    const quoted = prefill({
      fields: {
        nonRenewalClauseText: f('  Se prorroga.  '),
        changesText: notice('\n Sube la franquicia. '),
      },
    });
    expect(quoted.quotes).toEqual({ renews: 'Se prorroga.', changes: 'Sube la franquicia.' });
    const none = prefill({ fields: { nonRenewalClauseText: f('   '), changesText: notice(42) } });
    expect(none.quotes).toEqual({});
  });

  it('puts the doubt before the notice date note, and the checks last', () => {
    const p = prefill({ fields: { line: f('home', 'low'), noticeOn: notice('2026-09-20') } }, [
      'expiry_before_effect',
      'premium_parts_do_not_sum',
    ]);
    expect(p.notes).toEqual([
      t('es', 'client.documents.done_low'),
      t('es', 'client.insurance.documents.notice_date'),
      t('es', 'client.insurance.documents.check.expiry_before_effect'),
      t('es', 'client.insurance.documents.check.premium_parts_do_not_sum'),
    ]);
  });
});
