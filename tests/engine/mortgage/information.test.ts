import { describe, expect, it } from 'vitest';
import { parseDate } from '../../../src/engine/date';
import { informationBlocks } from '../../../src/engine/mortgage/information';
import type { SourceTable } from '../../../src/engine/mortgage/norms';
import { DEPS, mortgage, TODAY } from './input';
import { MORTGAGE_NORMS_BEFORE_VOTE } from './norms-before-vote';

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

  it('a 2012 deed: the time limit as a rule, with the Court of Justice and Supreme Court rulings', () => {
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
      ['tjue_c561_21', 'sts857_2024'],
      '2026-10-10',
    ]);
  });

  it('a 2016 deed tells of the handwritten statement of Ley 1/2013', () => {
    expect(brief('2016-03-01')[0]).toEqual([
      'handwritten_statement',
      'statute',
      ['information.handwritten_statement'],
      ['handwritten_statement'],
      null,
    ]);
    expect(brief('2012-05-10').map((b) => b[0])).not.toContain('handwritten_statement');
  });

  it('art. 25 bis is told only from 08-10-2026', () => {
    expect(brief('2021-05-10', d('2026-10-07')).map((b) => b[0])).not.toContain('loan_assignment');
    expect(brief('2021-05-10', d('2026-10-08')).map((b) => b[0])).toContain('loan_assignment');
  });

  it('art. 25 bis is told with its pending status while RDL 29/2026 awaits the vote', () => {
    const block = informationBlocks(mortgage({ deedOn: d('2021-05-10') }), TODAY, {
      ...DEPS,
      norms: MORTGAGE_NORMS_BEFORE_VOTE,
    }).find((b) => b.id === 'loan_assignment');
    expect(block?.sources[0]).toMatchObject({ status: 'pending_validation' });
    expect(block?.calculation.map((c) => c.key)).toEqual([
      'information.loan_assignment',
      'information.loan_assignment_pending',
    ]);
  });

  it('art. 25 bis is told as in force, with the day RDL 29/2026 was validated', () => {
    const block = blocksOf('2021-05-10').find((b) => b.id === 'loan_assignment');
    expect(block?.sources[0]).toMatchObject({ status: 'in_force', statusSince: '2026-11-13' });
    expect(block?.calculation.map((c) => c.key)).toEqual(['information.loan_assignment']);
  });

  it('the step of art. 439 bis exists from 03-04-2025', () => {
    expect(brief('2021-05-10', d('2025-04-02')).map((b) => b[0])).not.toContain(
      'prior_step_439bis',
    );
  });

  it.each([{ verified: false }, { basis: 'official_data' }])(
    'the time limit is not told while none of its rulings counts as read: %j',
    (change) => {
      const sources = { ...DEPS.sources };
      for (const id of ['tjue_c561_21', 'sts857_2024'] as const)
        sources[id] = { ...sources[id], ...change } as SourceTable[typeof id];
      const ids = informationBlocks(mortgage({ deedOn: d('2012-05-10') }), TODAY, {
        ...DEPS,
        sources,
      }).map((b) => b.id);
      expect(ids).toEqual(['prior_step_439bis', 'loan_assignment', 'complaints_service']);
    },
  );
});
