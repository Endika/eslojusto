import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { informationBlocks } from '../../../src/engine/mortgage/information';
import { DEPS, mortgage, TODAY } from './input';

const d = parseDate;

const blocksOf = (deedOn: string, today = TODAY) =>
  informationBlocks(mortgage({ deedOn: d(deedOn) }), today, DEPS);

const brief = (deedOn: string, today = TODAY) =>
  blocksOf(deedOn, today).map((b) => [
    b.id,
    b.basis,
    b.calculation.map((c) => c.key),
    b.sources.map((s) => s.id),
    b.statusAsOf,
  ]);

describe('information blocks', () => {
  it('a 2021 deed: FEIN and notary record, the step of art. 439 bis, art. 25 bis and the official channel', () => {
    expect(brief('2021-05-10')).toEqual([
      [
        'fein_timing',
        'statute',
        ['information.fein_timing', 'information.transparency_act'],
        ['fein_timing', 'transparency_act_free'],
        null,
      ],
      [
        'prior_step_439bis',
        'statute',
        ['information.prior_step_439bis'],
        ['prior_step_439bis'],
        null,
      ],
      ['loan_assignment', 'statute', ['information.loan_assignment'], ['loan_assignment'], null],
      [
        'complaints_service',
        'statute',
        ['information.complaints_service'],
        ['complaints_service'],
        null,
      ],
    ]);
  });

  it('a 2012 deed: the time limit as a rule, with the Court of Justice ruling only', () => {
    const blocks = brief('2012-05-10');
    expect(blocks.map((b) => b[0])).toEqual([
      'limitation_rule',
      'prior_step_439bis',
      'loan_assignment',
      'complaints_service',
    ]);
    expect(blocks[0]).toEqual([
      'limitation_rule',
      'case_law',
      ['information.limitation_rule'],
      ['tjue_c561_21'],
      '2026-10-07',
    ]);
  });

  it('a 2016 deed tells of the handwritten statement of Ley 1/2013', () => {
    expect(brief('2016-03-01').map((b) => b[0])).toContain('handwritten_statement');
    expect(brief('2012-05-10').map((b) => b[0])).not.toContain('handwritten_statement');
  });

  it('art. 25 bis is told only from 08-10-2026, with its pending status', () => {
    expect(brief('2021-05-10', d('2026-10-07')).map((b) => b[0])).not.toContain('loan_assignment');
    const block = blocksOf('2021-05-10').find((b) => b.id === 'loan_assignment');
    expect(block?.sources[0]).toMatchObject({ status: 'pending_validation' });
  });

  it('the step of art. 439 bis exists from 03-04-2025', () => {
    expect(brief('2021-05-10', d('2025-04-02')).map((b) => b[0])).not.toContain(
      'prior_step_439bis',
    );
  });
});
