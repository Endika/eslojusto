import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  reviewInformationDuty,
  type InformationDuty,
} from '../../../src/engine/employment/information-duty';
import {
  INFO_ELEMENTS,
  type EmploymentInput,
  type Finding,
  type InfoElement,
  type InfoPresence,
} from '../../../src/engine/employment/types';
import { contract } from './input';

const withInfo = (
  change: Partial<Record<InfoElement, InfoPresence>>,
  rest: Partial<EmploymentInput> = {},
): EmploymentInput => {
  const base = contract(rest);
  return { ...base, info: { ...base.info, ...change } };
};

const started = (start: string, change: Partial<EmploymentInput> = {}) => ({
  startDate: parseDate(start),
  signedOn: parseDate(start),
  ...change,
});

const duty = (input: EmploymentInput): InformationDuty =>
  reviewInformationDuty(input, EMPLOYMENT_NORMS);

const elementOf = (d: InformationDuty, element: InfoElement): Finding => {
  if (!d.applies) throw new Error('expected the duty to apply');
  const check = d.elements.find((e) => e.element === element);
  if (check?.applies !== true) throw new Error(`expected ${element} to be checked`);
  return check.finding;
};

const keys = (f: Finding) => f.calculation.map((p) => p.key);
const cited = (f: Finding) => f.sources.map((s) => s.id);

describe('information duty (RD 723/2026)', () => {
  it('a contract started on 06-10-2026 without its agreement: owed before starting (art. 7.1)', () => {
    const d = duty(withInfo({ o: 'absent' }, started('2026-10-06')));
    expect(d.applies && d.moment).toBe('before_start');
    const o = elementOf(d, 'o');
    expect(o.status).toBe('missing_requirement');
    expect(keys(o)).toContain('information.missing_before_start');
    expect(cited(o)).toEqual(['info_elements', 'info_before_start']);
  });

  it('a contract started in 2025: the person can ask for it (transitional provision)', () => {
    const d = duty(withInfo({ o: 'absent' }, started('2025-03-03')));
    expect(d.applies && d.moment).toBe('on_request');
    const o = elementOf(d, 'o');
    expect(o.status).toBe('missing_requirement');
    expect(keys(o)).toContain('information.missing_on_request');
    expect(cited(o)).toEqual(['info_elements', 'info_on_request']);
  });

  it('the day the decree takes effect already counts as before starting', () => {
    const d = duty(withInfo({}, started('2026-10-05')));
    expect(d.applies && d.moment).toBe('before_start');
  });

  it('a relationship of three weeks is outside the list (art. 2.2)', () => {
    const d = duty(
      withInfo(
        { o: 'absent' },
        started('2026-10-26', { modality: 'production', endDate: parseDate('2026-11-15') }),
      ),
    );
    expect(d).toEqual(expect.objectContaining({ applies: false, reason: 'short_relation' }));
    expect(!d.applies && d.sources.map((s) => s.id)).toEqual(['info_short_relations']);
  });

  it('exactly four weeks is still outside; one day more is inside', () => {
    const term = (end: string) =>
      duty(
        withInfo({}, started('2026-10-05', { modality: 'production', endDate: parseDate(end) })),
      );
    expect(term('2026-11-01').applies).toBe(false);
    expect(term('2026-11-02').applies).toBe(true);
  });

  describe('a relationship of four weeks or less (RDL 39/2026)', () => {
    const short = (
      start: string,
      end: string,
      info: Partial<Record<InfoElement, InfoPresence>> = {},
    ) => duty(withInfo(info, started(start, { modality: 'production', endDate: parseDate(end) })));

    it('ended on 18-11-2026: still outside, citing art. 2.2 with its last day', () => {
      const d = short('2026-11-02', '2026-11-18');
      expect(d).toEqual(expect.objectContaining({ applies: false, reason: 'short_relation' }));
      expect(!d.applies && d.sources.map((s) => [s.id, s.inForceUntil])).toEqual([
        ['info_short_relations', '2026-11-18'],
      ]);
    });

    it('in force on 19-11-2026 but started before: on request within ten working days', () => {
      const d = short('2026-11-10', '2026-11-19', { o: 'absent' });
      expect(d.applies && d.moment).toBe('short_on_request');
      const o = elementOf(d, 'o');
      expect(keys(o)).toContain('information.missing_short_on_request');
      expect(keys(o)).not.toContain('information.missing_on_request');
      expect(cited(o)).toEqual(['info_elements', 'info_short_on_request']);
      expect(o.sources.at(-1)).toEqual(
        expect.objectContaining({
          citation:
            'disposición transitoria segunda (Real Decreto-ley 39/2026, de 17 de noviembre)',
          inForceSince: '2026-11-19',
        }),
      );
    });

    it('started on 19-11-2026: owed before starting like any other contract', () => {
      const d = short('2026-11-19', '2026-12-10', { o: 'absent' });
      expect(d.applies && d.moment).toBe('before_start');
      expect(cited(elementOf(d, 'o'))).toEqual(['info_elements', 'info_before_start']);
    });

    it('started on 18-11-2026 and running the next day: on request, not before starting', () => {
      const d = short('2026-11-18', '2026-12-09');
      expect(d.applies && d.moment).toBe('short_on_request');
    });
  });

  it('a relationship that ended before the decree took effect is outside it', () => {
    const d = duty(
      withInfo(
        {},
        started('2025-01-07', { modality: 'production', endDate: parseDate('2025-06-30') }),
      ),
    );
    expect(d).toEqual(expect.objectContaining({ applies: false, reason: 'ended_before_decree' }));
    expect(!d.applies && d.sources.map((s) => s.id)).toEqual(['info_on_request']);
  });

  it('lists the agreement and the category first, and every element once', () => {
    const d = duty(contract());
    if (!d.applies) throw new Error('expected the duty to apply');
    const order = d.elements.map((e) => e.element);
    expect(order.slice(0, 2)).toEqual(['o', 'e']);
    expect([...order].sort()).toEqual([...INFO_ELEMENTS]);
  });

  it('the agency element never applies: agency contracts are outside the review', () => {
    const d = duty(withInfo({ j: 'absent' }));
    if (!d.applies) throw new Error('expected the duty to apply');
    expect(d.elements.find((e) => e.element === 'j')).toEqual({
      element: 'j',
      applies: false,
      reason: 'temp_agency_only',
    });
  });

  it('the trial period element applies only when one is agreed (art. 3.2.h)', () => {
    const none = duty(withInfo({ h: 'absent' }, { trial: null }));
    const agreed = duty(withInfo({ h: 'absent' }));
    if (!none.applies || !agreed.applies) throw new Error('expected the duty to apply');
    expect(none.elements.find((e) => e.element === 'h')).toEqual({
      element: 'h',
      applies: false,
      reason: 'no_trial',
    });
    expect(none.elements.filter((e) => e.applies).length).toBe(INFO_ELEMENTS.length - 2);
    expect(agreed.elements.find((e) => e.element === 'h')).toMatchObject({
      applies: true,
      finding: { status: 'missing_requirement' },
    });
  });

  it.each(['h', 'i', 'n', 'p'] as const)(
    '%s given by reference to the law or the agreement counts as present (art. 3.3)',
    (element) => {
      expect(elementOf(duty(withInfo({ [element]: 'by_reference' })), element).status).toBe(
        'within_limit',
      );
    },
  );

  it.each(['f', 'g'] as const)(
    '%s by reference covers the amount and the hours, not variable pay or irregular distribution',
    (element) => {
      const f = elementOf(duty(withInfo({ [element]: 'by_reference' })), element);
      expect(f.status).toBe('review_it');
      expect(keys(f)).toContain('information.reference_covers_part');
    },
  );

  it.each(['a', 'b', 'c', 'd', 'e', 'o', 'q'] as const)(
    '%s given only by reference is left to review, never counted as missing',
    (element) => {
      const f = elementOf(duty(withInfo({ [element]: 'by_reference' })), element);
      expect(f.status).toBe('review_it');
      expect(keys(f)).toContain('information.reference_not_allowed');
    },
  );

  it.each(['k', 'm'] as const)(
    '%s missing is owed only if the company uses or has it',
    (element) => {
      const f = elementOf(duty(withInfo({ [element]: 'absent' })), element);
      expect(f.status).toBe('review_it');
      expect(keys(f)).toContain('information.only_if_used');
    },
  );

  it('l missing is owed: the harassment protocol always is, the equality plan if there is one', () => {
    const f = elementOf(duty(withInfo({ l: 'absent' })), 'l');
    expect(f.status).toBe('missing_requirement');
    expect(keys(f)).toContain('information.protocol_always');
  });

  it('an element the person does not know about is left to review', () => {
    expect(elementOf(duty(withInfo({ b: 'unknown' })), 'b').status).toBe('review_it');
  });

  it('the cause is asked of a fixed-term contract only', () => {
    const temporary = started('2026-10-06', {
      modality: 'production',
      endDate: parseDate('2027-03-31'),
    });
    expect(keys(elementOf(duty(withInfo({ d: 'absent' }, temporary)), 'd'))).toContain(
      'information.temporary_cause',
    );
    expect(keys(elementOf(duty(withInfo({ d: 'absent' })), 'd'))).not.toContain(
      'information.temporary_cause',
    );
  });

  it.each<[InfoElement, InfoPresence, string[]]>([
    ['h', 'by_reference', ['information.by_reference']],
    ['a', 'unknown', ['information.unknown', 'information.missing_before_start']],
    ['k', 'unknown', ['information.only_if_used', 'information.missing_before_start']],
  ])('element %s %s says exactly %j', (element, presence, expected) => {
    const f = elementOf(duty(withInfo({ [element]: presence }, started('2026-10-06'))), element);
    expect(keys(f)).toEqual(expected);
  });

  it('only the cause element is told about the temporary cause', () => {
    const temporary = started('2026-10-06', {
      modality: 'production',
      endDate: parseDate('2027-03-31'),
    });
    expect(keys(elementOf(duty(withInfo({ a: 'absent' }, temporary)), 'a'))).toEqual([
      'information.missing_before_start',
    ]);
    expect(keys(elementOf(duty(withInfo({ d: 'absent' }, temporary)), 'd'))).toEqual([
      'information.temporary_cause',
      'information.missing_before_start',
    ]);
  });

  it('never opens the pass on its own', () => {
    const allAbsent = Object.fromEntries(INFO_ELEMENTS.map((e) => [e, 'absent']));
    const d = duty(withInfo(allAbsent, started('2026-10-06')));
    if (!d.applies) throw new Error('expected the duty to apply');
    const statuses = new Set(d.elements.flatMap((e) => (e.applies ? [e.finding.status] : [])));
    expect([...statuses].sort()).toEqual(['missing_requirement', 'review_it']);
  });
});
