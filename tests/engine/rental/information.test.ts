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

// Every number anywhere inside a value.
const numbersIn = (v: unknown): number[] =>
  typeof v === 'number'
    ? [v]
    : v !== null && typeof v === 'object'
      ? Object.values(v).flatMap(numbersIn)
      : [];

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
    const b = find(blocks(), 'reference_price');
    expect(b.sources.map((s) => [s.id, s.status])).toEqual([['cap_2_rdl29', 'pending_validation']]);
  });

  it('not once the keys are back before any such anniversary', () => {
    const moveOut = { keysReturnedOn: f('2026-06-30'), returns: [], deductions: [] };
    expect(ids(blocks({ moveOut }))).not.toContain('reference_price');
  });
});

describe('term and extensions, dates only', () => {
  it('three years agreed with a person: five-year term and its notice windows', () => {
    const bs = blocks({ startDate: f('2021-03-20'), agreedMonths: 36 });
    expect(find(bs, 'minimum_term').dates).toEqual({
      contractEnd: '2024-03-20',
      mandatoryEnd: '2026-03-20',
    });
    expect(find(bs, 'notice_windows').dates).toEqual({
      landlordBy: '2025-11-20',
      tenantBy: '2026-01-20',
      tacitUntil: '2029-03-20',
    });
    expect(ids(bs)).not.toContain('extensions_rdl28');
    expect(ids(bs)).not.toContain('extension_rdl29');
  });

  it('seven years with a company', () => {
    const bs = blocks({ startDate: f('2021-03-20'), agreedMonths: 36, landlordType: 'company' });
    expect(find(bs, 'minimum_term').dates.mandatoryEnd).toBe('2028-03-20');
  });

  it('a term ending after 15-11-2026 names RDL 28/2026 and RDL 29/2026, both pending', () => {
    const bs = blocks({ signedOn: f('2022-01-05'), startDate: f('2022-01-10'), agreedMonths: 12 });
    expect(find(bs, 'minimum_term').dates.mandatoryEnd).toBe('2027-01-10');
    expect(find(bs, 'extensions_rdl28').sources[0]?.status).toBe('pending_validation');
    expect(find(bs, 'extension_rdl29').sources[0]?.status).toBe('pending_validation');
    expect(ids(bs)).toContain('notice_windows');
  });

  it('once RDL 28/2026 is validated, its art. 10 replaces the tacit extension', () => {
    const validated = withNorm('rdl28_2026', { status: 'in_force', statusSince: '2026-11-20' });
    const bs = blocks(
      { signedOn: f('2022-01-05'), startDate: f('2022-01-10'), agreedMonths: 12 },
      validated,
    );
    expect(ids(bs)).not.toContain('notice_windows');
    expect(find(bs, 'extensions_rdl28').sources[0]?.status).toBe('in_force');
  });
});

describe('always there', () => {
  it('deposit lodging, the region and meter-read supplies', () => {
    const bs = blocks({ region: 'CT' });
    expect(ids(bs)).toEqual(
      expect.arrayContaining(['deposit_lodging', 'regional_rules', 'meters']),
    );
    expect(find(bs, 'regional_rules')).toMatchObject({
      region: 'CT',
      links: ['https://www.boe.es/buscar/act.php?id=BOE-A-1994-26003'],
    });
  });
});

describe('moving out', () => {
  const moveOut = (keys: string) => ({ keysReturnedOn: f(keys), returns: [], deductions: [] });

  it('the closing document from 08-10-2026, pending validation', () => {
    expect(
      find(blocks({ moveOut: moveOut('2026-10-20') }), 'closing_document').sources[0],
    ).toMatchObject({ id: 'closing_document', status: 'pending_validation' });
    expect(ids(blocks({ moveOut: moveOut('2026-09-30') }))).not.toContain('closing_document');
  });

  it('extra guarantees in money accrue no interest here', () => {
    const bs = blocks({
      moveOut: moveOut('2026-09-30'),
      guarantees: [{ kind: 'cash', amount: 1500 }],
    });
    expect(ids(bs)).toContain('guarantee_return');
  });
});

describe('no block carries an amount', () => {
  it.each([
    ['a plain contract', {}],
    [
      'everything opened',
      {
        signedOn: f('2024-02-01'),
        startDate: f('2024-02-01'),
        agreedMonths: 12,
        stressedZone: true,
        guarantees: [{ kind: 'cash' as const, amount: 1500 }],
        moveOut: { keysReturnedOn: f('2026-10-20'), returns: [], deductions: [] },
      },
    ],
  ])('%s', (_, change) => {
    expect(numbersIn(blocks(change))).toEqual([]);
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
