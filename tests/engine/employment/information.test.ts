import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_NORMS } from '../../../src/engine/employment/data/norms';
import {
  informationBlocks,
  scopeBlock,
  type InformationBlock,
} from '../../../src/engine/employment/information';
import { contract } from './input';

// An amount is a euro figure anywhere in a block, or an amount field.
const carriesAmount = (block: InformationBlock): boolean =>
  /"(euros|amount)"/.test(JSON.stringify(block));

const PART_TIME = {
  hoursStated: true,
  distributionStated: true,
  complementary: null,
  voluntaryPercent: null,
};

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

  it('says whether the contract names its agreement, without looking up its tables', () => {
    const named = informationBlocks(
      contract({ agreement: { ...contract().agreement, named: true } }),
      EMPLOYMENT_NORMS,
    );
    expect(named[0]?.calculation[0]?.key).toBe('information.agreement.named');
    expect(blocks()[0]?.calculation[0]?.key).toBe('information.agreement.not_named');
  });

  it('the model document cites only the decree that announces it', () => {
    const model = blocks().find((b) => b.id === 'information_model');
    expect(model?.links).toEqual([]);
    expect(model?.sources.map((s) => s.url)).toEqual([
      'https://www.boe.es/buscar/act.php?id=BOE-A-2026-19200#da',
    ]);
  });

  it('part time adds the monthly summary to the time record', () => {
    const record = informationBlocks(contract({ partTime: PART_TIME }), EMPLOYMENT_NORMS).find(
      (b) => b.id === 'time_record',
    );
    expect(record?.sources.map((s) => s.id)).toEqual(['time_record', 'part_time_record']);
  });

  it('a minor sees the limits of arts. 6, 34.3 and 37.1 as information', () => {
    const minors = scopeBlock('minor', EMPLOYMENT_NORMS);
    expect(minors.id).toBe('minors');
    expect(minors.sources.map((s) => s.id)).toEqual(['minors_work', 'daily_9', 'weekly_rest_36']);
  });

  it.each(['special_relationship', 'public_servant', 'temp_agency', 'relief'] as const)(
    'outside the review for %s, only the reason',
    (reason) => {
      expect(scopeBlock(reason, EMPLOYMENT_NORMS).calculation.map((p) => p.key)).toEqual([
        `information.out_of_scope.${reason}`,
      ]);
    },
  );

  it('no block carries an amount', () => {
    const all = [
      ...informationBlocks(contract({ partTime: PART_TIME }), EMPLOYMENT_NORMS),
      ...(
        ['minor', 'special_relationship', 'public_servant', 'temp_agency', 'relief'] as const
      ).map((r) => scopeBlock(r, EMPLOYMENT_NORMS)),
    ];
    expect(all.filter(carriesAmount).map((b) => b.id)).toEqual([]);
  });
});
