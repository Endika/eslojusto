import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import { informationBlocks, scopeBlock } from '../../../src/engine/employment/information';
import { contract } from './input';

describe('information blocks', () => {
  const blocks = () => informationBlocks(contract(), EMPLOYMENT_NORMS);

  it('lists the agreement, public holidays, time record, late payment, limitation and the model', () => {
    expect(blocks().map((b) => b.id)).toEqual([
      'agreement',
      'public_holidays',
      'time_record',
      'late_payment_interest',
      'limitation',
      'information_model',
    ]);
  });

  it('each block says its own phrases and cites its own sources', () => {
    expect(
      blocks().map((b) => [b.id, b.calculation.map((p) => p.key), b.sources.map((s) => s.id)]),
    ).toEqual([
      [
        'agreement',
        [
          'information.agreement.not_named',
          'information.agreement.where',
          'information.agreement.sector_salary_amount_priority',
        ],
        ['agreement_salary'],
      ],
      ['public_holidays', ['information.public_holidays'], ['public_holidays']],
      ['time_record', ['working_time.time_record'], ['time_record']],
      ['late_payment_interest', ['information.late_payment_interest'], ['late_payment_interest']],
      ['limitation', ['information.limitation'], ['limitation']],
      ['information_model', ['information.model'], ['info_model']],
    ]);
  });

  it('only the agreement links the public register', () => {
    expect(blocks().map((b) => b.links.map((l) => l.url))).toEqual([
      ['https://expinterweb.mites.gob.es/regcon/'],
      [],
      [],
      [],
      [],
      [],
    ]);
  });

  it('a minor sees the limits of arts. 6, 34.3 and 37.1 as information', () => {
    const minors = scopeBlock('minor', EMPLOYMENT_NORMS);
    expect(minors.id).toBe('minors');
    expect(minors.sources.map((s) => s.id)).toEqual(['minors_work', 'daily_9', 'weekly_rest_36']);
  });

  it.each(['temp_agency'] as const)('outside the review for %s, only the reason', (reason) => {
    expect(scopeBlock(reason, EMPLOYMENT_NORMS).calculation.map((p) => p.key)).toEqual([
      `information.out_of_scope.${reason}`,
    ]);
  });
});
