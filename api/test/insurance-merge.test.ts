import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { insuranceFailedChecks, insuranceIncomplete } from '../src/domain/insurance-checks';
import { INSURANCE_MERGE_RULES, insuranceMerge } from '../src/domain/insurance-merge';
import { INSURANCE_SECTIONS } from '../src/domain/insurance-schema';
import { f, page } from './support/fields';

const PAGES = [page(1, 'insurance_policy'), page(2, 'insurance_renewal_notice')];
const pack = (input: Record<string, unknown>, pages = PAGES) =>
  insuranceMerge(parseReading({ pages, ...input }, pages.length, 'insurance'));
const checks = (input: Record<string, unknown>) =>
  insuranceFailedChecks(parseReading({ pages: PAGES, ...input }, PAGES.length, 'insurance'));

describe('insuranceMerge', () => {
  it('merges every policy and notice field, and nothing else', () => {
    const fields = Object.values(INSURANCE_SECTIONS).flatMap((s) => Object.keys(s.fields));
    expect(Object.keys(INSURANCE_MERGE_RULES).sort()).toEqual([...new Set(fields)].sort());
  });

  it('takes the end of the period from the renewal notice first, and flags a policy that differs', () => {
    const m = pack({
      insurance_policy: { line: f('car'), expiresOn: f('2026-03-31') },
      insurance_renewal_notice: { expiresOn: f('2027-03-31'), newPremium: f(412.3) },
    });
    expect(m.fields).toEqual({
      line: { ...f('car'), source: 'insurance_policy' },
      expiresOn: { ...f('2027-03-31'), source: 'insurance_renewal_notice' },
      newPremium: { ...f(412.3), source: 'insurance_renewal_notice' },
    });
    expect(m.conflicts).toEqual([
      { field: 'expiresOn', sources: ['insurance_renewal_notice', 'insurance_policy'] },
    ]);
  });

  it('keeps an intermediary’s name for a company only', () => {
    const named = (type: string) =>
      pack({
        insurance_policy: {
          intermediaryType: f(type),
          intermediaryCompanyName: f('Correduría Imaginaria S.L.'),
        },
      });
    expect(named('company').fields.intermediaryCompanyName?.value).toBe(
      'Correduría Imaginaria S.L.',
    );
    expect(named('person').fields.intermediaryCompanyName).toBeUndefined();
    expect(named('person').discarded).toBe(1);
  });

  it('drops a copied text that holds an identifier or tells about health, and keeps the figures', () => {
    const m = pack({
      insurance_policy: {
        premiumTotal: f(312.45),
        nonRenewalClauseText: f('Tomador: Fulano Inventado, tel. 600123456.'),
        sumsInsured: [
          { kind: 'other', concept: 'Asistencia por enfermedad', amount: 3000, confidence: 'high' },
        ],
      },
      insurance_renewal_notice: { changesText: f('Asegurado con discapacidad reconocida.') },
    });
    expect(m.fields).toEqual({ premiumTotal: { ...f(312.45), source: 'insurance_policy' } });
    expect(m.lists.sumsInsured).toEqual([
      { values: { kind: 'other', amount: 3000 }, confidence: 'high', source: 'insurance_policy' },
    ]);
    expect(m.discarded).toBe(3);
    expect(JSON.stringify(m)).not.toMatch(/Fulano|600123456|enfermedad|discapacidad/);
  });
});

describe('insuranceFailedChecks', () => {
  it('passes a coherent pack', () => {
    expect(
      checks({
        insurance_policy: {
          effectiveOn: f('2026-03-31'),
          expiresOn: f('2027-03-31'),
          premiumNet: f(260),
          premiumSurcharges: f(3.12),
          premiumTaxes: f(15.6),
          premiumTotal: f(278.72),
        },
        insurance_renewal_notice: { noticeOn: f('2027-01-20'), expiresOn: f('2027-03-31') },
      }),
    ).toEqual([]);
  });

  it.each([
    [
      'expiry_before_effect',
      { insurance_policy: { effectiveOn: f('2026-03-31'), expiresOn: f('2026-03-30') } },
    ],
    [
      'notice_after_expiry',
      { insurance_renewal_notice: { noticeOn: f('2027-04-02'), expiresOn: f('2027-03-31') } },
    ],
    [
      'premium_parts_do_not_sum',
      { insurance_policy: { premiumNet: f(260), premiumTaxes: f(15.6), premiumTotal: f(300) } },
    ],
  ])('flags %s', (check, input) => {
    expect(checks(input)).toEqual([check]);
  });
});

describe('insuranceIncomplete', () => {
  const incomplete = (input: Record<string, unknown>) => {
    const reading = parseReading({ pages: PAGES, ...input }, PAGES.length, 'insurance');
    return insuranceIncomplete(reading, insuranceMerge(reading));
  };

  it('doubts a legible policy or notice that gives no end date', () => {
    expect(incomplete({ insurance_policy: { line: f('home') } })).toBe(true);
    expect(incomplete({ insurance_renewal_notice: { expiresOn: f('2027-03-01') } })).toBe(false);
  });
});
