import { describe, expect, it } from 'vitest';
import { phrase } from '../../../src/engine/household/calculation';
import { findingsFor } from '../../../src/engine/household/finding';
import { NORMS } from './norms-table';

describe('phrase', () => {
  it('carries no vars key when it has none', () => {
    expect(phrase('notice.days')).toStrictEqual({ key: 'notice.days' });
  });

  it('keeps the vars it is given', () => {
    expect(phrase('notice.days', { given: 3 })).toStrictEqual({
      key: 'notice.days',
      vars: { given: 3 },
    });
  });
});

describe('a finding built from a full verdict', () => {
  it('keeps the flags it is given and cites the rules it also rests on', () => {
    const finding = findingsFor('notice')(
      'notice_calendar_days',
      {
        status: 'warning',
        basedOnYourAnswer: true,
        agreementMaySetOther: true,
        alsoCites: ['desistimiento_notice', 'notice_calendar_days'],
      },
      NORMS,
    );
    expect(finding.basedOnYourAnswer).toBe(true);
    expect(finding.agreementMaySetOther).toBe(true);
    expect(finding.sources).toHaveLength(2);
  });
});
