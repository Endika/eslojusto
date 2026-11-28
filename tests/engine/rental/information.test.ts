import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { NORMS } from '../../../src/engine/rental/data/norms';
import {
  informationBlocks,
  type InformationBlock,
  type InformationId,
} from '../../../src/engine/rental/information';
import type { Norm, NormTable } from '../../../src/engine/rental/norms';
import type { RentalInput } from '../../../src/engine/rental/types';
import { contract } from './fixtures';
import { NORMS_BEFORE_VOTE } from './norms-before-vote';

const blocks = (change: Partial<RentalInput> = {}, norms: NormTable = NORMS) =>
  informationBlocks(contract(change), norms);
const ids = (bs: readonly InformationBlock[]): InformationId[] => bs.map((b) => b.id);
const find = (bs: readonly InformationBlock[], id: InformationId): InformationBlock => {
  const b = bs.find((x) => x.id === id);
  if (b === undefined) throw new Error(`no ${id}`);
  return b;
};
const withNorm = (id: keyof NormTable, change: Partial<Norm>): NormTable => ({
  ...NORMS,
  [id]: { ...NORMS[id], ...change },
});

describe('stressed zones', () => {
  const signed2024 = { signedOn: f('2024-02-01'), startDate: f('2024-02-01') };

  it('a yes or «No lo sé» on a contract from 26-05-2023 points to SERPAVI', () => {
    const yes = find(blocks({ ...signed2024, stressedZone: true }), 'stressed_zone');
    expect(yes.answer).toBe('yes');
    expect(yes.links).toEqual([
      'https://www.mivau.gob.es/vivienda/alquila-bien-es-tu-derecho/serpavi',
    ]);
    expect(find(blocks({ ...signed2024, stressedZone: null }), 'stressed_zone').answer).toBe(
      'unknown',
    );
  });

  it('nothing on a no, nor before Ley 12/2023', () => {
    expect(ids(blocks({ ...signed2024, stressedZone: false }))).not.toContain('stressed_zone');
    expect(
      ids(blocks({ signedOn: f('2023-05-25'), startDate: f('2023-05-25'), stressedZone: true })),
    ).not.toContain('stressed_zone');
  });
});

describe('the RDL 29/2026 reference price', () => {
  it('is named, pending validation, for a contract with an anniversary in its window', () => {
    const b = find(blocks({}, NORMS_BEFORE_VOTE), 'reference_price');
    expect(b.sources.map((s) => [s.id, s.status])).toEqual([['cap_2_rdl29', 'pending_validation']]);
  });

  it('is named as in force, with the day it was validated', () => {
    const b = find(blocks(), 'reference_price');
    expect(b.sources.map((s) => [s.id, s.status])).toEqual([['cap_2_rdl29', 'in_force']]);
    expect(b.sources[0]?.statusSince).toBe('2026-11-13');
  });

  it('not once the keys are back before any such anniversary', () => {
    const moveOut = { keysReturnedOn: f('2026-06-30'), returns: [], deductions: [] };
    expect(ids(blocks({ moveOut }))).not.toContain('reference_price');
  });
});

describe('term and extensions, dates only', () => {
  it('counts from the signing when the keys came before it (LAU art. 9.1)', () => {
    const bs = blocks({ signedOn: f('2021-04-02'), startDate: f('2021-03-20'), agreedMonths: 12 });
    expect(find(bs, 'minimum_term').dates).toEqual({
      contractEnd: '2022-04-02',
      mandatoryEnd: '2026-04-02',
    });
  });

  const endsIn2027 = { signedOn: f('2022-01-05'), startDate: f('2022-01-10'), agreedMonths: 12 };

  it('a term ending after 15-11-2026 names RDL 28/2026 and RDL 29/2026, both pending', () => {
    const bs = blocks(endsIn2027, NORMS_BEFORE_VOTE);
    expect(find(bs, 'minimum_term').dates.mandatoryEnd).toBe('2027-01-10');
    expect(find(bs, 'extensions_rdl28').sources[0]?.status).toBe('pending_validation');
    expect(find(bs, 'extension_rdl29').sources[0]?.status).toBe('pending_validation');
    expect(ids(bs)).toContain('notice_windows');
  });

  it('a term ending after 15-11-2026 never names RDL 28/2026, repealed before it took effect', () => {
    const bs = blocks(endsIn2027);
    expect(find(bs, 'minimum_term').dates.mandatoryEnd).toBe('2027-01-10');
    expect(ids(bs)).not.toContain('extensions_rdl28');
    expect(ids(bs)).toContain('notice_windows');
    expect(find(bs, 'extension_rdl29').sources[0]?.status).toBe('in_force');
    expect(JSON.stringify(bs)).not.toContain('rdl28');
  });

  it('once RDL 28/2026 is validated, its art. 10 replaces the tacit extension', () => {
    const validated = withNorm('rdl28_2026', {
      inForceUntil: null,
      status: 'in_force',
      statusSince: '2026-11-20',
    });
    const bs = blocks(endsIn2027, validated);
    expect(ids(bs)).not.toContain('notice_windows');
    expect(find(bs, 'extensions_rdl28').sources[0]?.status).toBe('in_force');
  });
});

describe('moving out', () => {
  const moveOut = (keys: string) => ({ keysReturnedOn: f(keys), returns: [], deductions: [] });

  it('the closing document from 08-10-2026, pending validation', () => {
    expect(
      find(blocks({ moveOut: moveOut('2026-10-20') }, NORMS_BEFORE_VOTE), 'closing_document')
        .sources[0],
    ).toMatchObject({ id: 'closing_document', status: 'pending_validation' });
    expect(ids(blocks({ moveOut: moveOut('2026-09-30') }, NORMS_BEFORE_VOTE))).not.toContain(
      'closing_document',
    );
  });
});

describe('the tacit extension source', () => {
  it('cites the RDL 7/2019 wording of art. 10.1', () => {
    const b = find(blocks({ startDate: f('2021-03-20'), agreedMonths: 36 }), 'notice_windows');
    expect(b.sources[0]).toMatchObject({
      id: 'term_tacit',
      citation: 'LAU, art. 10.1 (Real Decreto-ley 7/2019, de 1 de marzo)',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003&tn=1&p=20190305#a10',
      inForceSince: '2019-03-06',
    });
  });
});

describe('what each block says and cites', () => {
  const SERPAVI = 'https://www.mivau.gob.es/vivienda/alquila-bien-es-tu-derecho/serpavi';
  const LAU = 'https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003';
  const shape = (bs: readonly InformationBlock[]) =>
    bs.map(({ id, dates, answer, region, links, sources }) => ({
      id,
      dates,
      answer,
      region,
      links,
      sources: sources.map((x) => x.id),
    }));
  const plain = { dates: {}, answer: null, region: null, links: [] };

  it('a stressed zone, a cash guarantee and a move-out add their blocks', () => {
    const bs = blocks({
      signedOn: f('2024-02-01'),
      startDate: f('2024-02-01'),
      agreedMonths: 12,
      stressedZone: true,
      guarantees: [{ kind: 'cash', amount: 1500 }],
      moveOut: { keysReturnedOn: f('2026-10-20'), returns: [], deductions: [] },
    });
    expect(shape(bs)).toEqual([
      {
        ...plain,
        id: 'stressed_zone',
        answer: 'yes',
        links: [SERPAVI],
        sources: ['stressed_zone'],
      },
      {
        ...plain,
        id: 'minimum_term',
        dates: { contractEnd: '2025-02-01', mandatoryEnd: '2029-02-01' },
        sources: ['term_minimum'],
      },
      {
        ...plain,
        id: 'notice_windows',
        dates: { landlordBy: '2028-10-01', tenantBy: '2028-12-01', tacitUntil: '2032-02-01' },
        sources: ['term_tacit'],
      },
      { ...plain, id: 'deposit_lodging', sources: ['deposit_lodging'] },
      { ...plain, id: 'regional_rules', region: 'MD', links: [LAU], sources: [] },
      { ...plain, id: 'meters', sources: ['charges_meters'] },
      { ...plain, id: 'guarantee_return', sources: ['deposit_interest'] },
      { ...plain, id: 'closing_document', sources: ['closing_document'] },
    ]);
  });

  it('a term ending in the extension window gives the window and, pending, the RDL 28 term', () => {
    const bs = blocks(
      { signedOn: f('2022-01-05'), startDate: f('2022-01-10'), agreedMonths: 12 },
      NORMS_BEFORE_VOTE,
    );
    expect(shape(bs).filter((b) => b.id.startsWith('extension'))).toEqual([
      {
        ...plain,
        id: 'extensions_rdl28',
        dates: { mandatoryEnd: '2027-01-10' },
        sources: ['term_rdl28'],
      },
      {
        ...plain,
        id: 'extension_rdl29',
        dates: { from: '2026-10-08', until: '2028-12-31' },
        sources: ['extension_rdl29'],
      },
    ]);
  });
});

describe('where the windows of RDL 29/2026 stop', () => {
  const termOf = (start: string, agreedMonths: number) => ({
    signedOn: f(start),
    startDate: f(start),
    agreedMonths,
  });

  it.each<[string, () => Partial<RentalInput>, boolean]>([
    ['a term ending on the last day of the extension window', () => termOf('2023-12-31', 12), true],
  ])('%s', (_, change, named) => {
    expect(ids(blocks(change())).includes('extension_rdl29')).toBe(named);
  });

  const refPrice = (change: Partial<RentalInput>) =>
    ids(blocks(change)).includes('reference_price');

  it('the reference price is not named for the start day itself, only for an anniversary', () => {
    expect(refPrice({ signedOn: f('2027-02-01'), startDate: f('2027-02-01') })).toBe(false);
    expect(refPrice({ signedOn: f('2026-10-20'), startDate: f('2026-10-20') })).toBe(true);
  });

  it('the reference price is not named for an anniversary on the day the keys are back', () => {
    const keys = (day: string) => ({ keysReturnedOn: f(day), returns: [], deductions: [] });
    expect(refPrice({ moveOut: keys('2027-03-20') })).toBe(false);
    expect(refPrice({ moveOut: keys('2027-03-21') })).toBe(true);
  });

  it.each<[string, () => RentalInput['guarantees'], boolean]>([
    ['cash with no amount names nothing', () => [{ kind: 'cash', amount: null }], false],
    [
      'a bank guarantee only names nothing',
      () => [{ kind: 'bank_guarantee', amount: 5000 }],
      false,
    ],
    ['no guarantee names nothing', () => [], false],
  ])('on moving out, %s', (_, guarantees, named) => {
    const moveOut = { keysReturnedOn: f('2026-09-30'), returns: [], deductions: [] };
    expect(ids(blocks({ moveOut, guarantees: guarantees() })).includes('guarantee_return')).toBe(
      named,
    );
  });
});
