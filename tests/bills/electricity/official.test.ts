import { beforeEach, describe, expect, it, vi } from 'vitest';
import { officialBlocks } from '../../../src/bills/electricity/official';
import type { CompletedElectricityReview } from '../../../src/bills/electricity/ports';
import type { Block } from '../../../src/documents/ports';
import {
  officialFigures,
  type EnergyFigures,
  type OfficialDeps,
  type PowerAgainstUse,
} from '../../../src/engine/bills/electricity-official';
import type { ElectricityReview } from '../../../src/engine/bills/electricity-review';
import type { Translate } from '../../../src/i18n/client';
import { juneBill } from '../../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../../engine/bills/norms-before-figure';

vi.mock('../../../src/engine/bills/electricity-official', () => ({ officialFigures: vi.fn() }));

const tr: Translate = (key, vars) => (vars ? `${key} ${JSON.stringify(vars)}` : key);
const PREFIX = 'client.bills.electricity.report.official.';

const entry: CompletedElectricityReview = {
  input: juneBill(),
  review: {} as ElectricityReview,
};
const pvpc = { source: 'Fuente', url: 'https://pvpc.example/' };
const holidays = { year: 2026, citation: 'Festivos', url: 'https://holidays.example/' };
const deps = { pvpc: {}, tollHolidays: [holidays] } as unknown as unknown as OfficialDeps;

function blocks(energy: EnergyFigures | null, power: readonly PowerAgainstUse[] | null): Block[] {
  vi.mocked(officialFigures).mockReturnValue({ energy, power });
  return officialBlocks([entry], { deps, pvpc }, NORMS_BEFORE_FIGURE, tr);
}

const texts = (list: Block[]) => list.map((b) => ('text' in b ? b.text : b.type));
const period = (p: 'p1' | 'all', extra: object = {}) => ({
  period: p,
  kwh: 100,
  yourPrice: 0.1,
  yourCost: 10,
  pvpcPrice: 0.12,
  pvpcCost: 12,
  ...extra,
});
const compared = (periods: object[], singlePrice = false): EnergyFigures =>
  ({ kind: 'compared', periods, singlePrice, yourCost: 20, pvpcCost: 24 }) as EnergyFigures;
const used = (extra: Partial<PowerAgainstUse> = {}): PowerAgainstUse => ({
  period: 'p1',
  contracted: 4.6,
  maxUsed: 3.1,
  perKwYear: 30,
  unusedKw: 1.5,
  unusedPerYear: 45,
  aboveContracted: false,
  ...extra,
});

beforeEach(() => vi.mocked(officialFigures).mockReset());

describe('the official figures of the report', () => {
  it('says the section is missing when the PVPC prices could not be loaded', () => {
    expect(officialBlocks([entry], null, NORMS_BEFORE_FIGURE, tr)).toEqual([
      { type: 'heading', text: `${PREFIX}heading` },
      { type: 'note', text: `${PREFIX}unavailable` },
    ]);
  });

  it('gives nothing when no bill has an energy or a power to compare', () => {
    expect(blocks(null, null)).toEqual([]);
    expect(officialBlocks([], { deps, pvpc }, NORMS_BEFORE_FIGURE, tr)).toEqual([]);
  });

  it('opens with the heading and the intro, and each bill with its heading', () => {
    const list = blocks({ kind: 'pvpc_bill' }, null);
    expect(list).toEqual([
      { type: 'heading', text: `${PREFIX}heading` },
      { type: 'text', text: `${PREFIX}intro` },
      { type: 'subheading', text: expect.stringContaining('client.bills.basket.bill') },
      { type: 'text', text: `${PREFIX}energy` },
      { type: 'note', text: `${PREFIX}pvpc_bill` },
    ]);
  });

  it('says a day with no PVPC price is pending', () => {
    expect(texts(blocks({ kind: 'pending' }, null)).slice(3)).toEqual([
      `${PREFIX}energy`,
      `${PREFIX}pending`,
    ]);
  });

  it('gives the power of a bill with no energy line, and nothing else', () => {
    const list = blocks(null, [used()]);
    expect(texts(list).slice(3)).toEqual([
      `${PREFIX}power`,
      expect.stringContaining(`${PREFIX}power_period {`),
      `${PREFIX}power_change`,
      expect.any(String),
    ]);
  });
});

describe('the energy against the PVPC', () => {
  it('words one price for all the energy, with its note, the sources and no total', () => {
    const list = blocks(compared([period('all')], true), null).slice(3);
    expect(list).toEqual([
      { type: 'text', text: `${PREFIX}energy` },
      {
        type: 'bullet',
        text: expect.stringMatching(
          /^client\.bills\.electricity\.report\.official\.energy_single \{.*"kwh":"client\.bills\.unit\.kwh \{\\"n\\":\\"100\\"\}".*"tuPrecio":"client\.bills\.unit\.per_kwh \{\\"n\\":\\"0,1000\\"\}"/,
        ),
      },
      { type: 'note', text: `${PREFIX}single_note` },
      { type: 'note', text: `${PREFIX}estimate` },
      { type: 'note', text: `${PREFIX}who` },
      { type: 'source', text: `${PREFIX}source_pvpc {"fuente":"Fuente"}`, url: pvpc.url },
      { type: 'source', text: holidays.citation, url: holidays.url },
      {
        type: 'source',
        text: expect.stringContaining(' · '),
        url: expect.stringMatching(/^https:/),
      },
    ]);
  });

  it('words a period, adds the periods up, and cites no holidays of another year', () => {
    vi.mocked(officialFigures).mockReturnValue({
      energy: compared([period('p1'), period('all', { period: 'p2' })]),
      power: null,
    });
    const other = {
      ...deps,
      tollHolidays: [{ ...holidays, year: 2025 }],
    } as unknown as OfficialDeps;
    const list = officialBlocks([entry], { deps: other, pvpc }, NORMS_BEFORE_FIGURE, tr).slice(3);
    expect(texts(list)).toEqual([
      `${PREFIX}energy`,
      expect.stringContaining(`${PREFIX}energy_period {"periodo":"${PREFIX}period.p1"`),
      expect.stringContaining(`${PREFIX}energy_period {"periodo":"${PREFIX}period.p2"`),
      expect.stringContaining(`${PREFIX}energy_total {"tuCoste"`),
      `${PREFIX}estimate`,
      `${PREFIX}who`,
      expect.stringContaining('Fuente'),
      expect.stringContaining(' · '),
    ]);
  });

  it('adds no total for one period', () => {
    expect(texts(blocks(compared([period('p1')]), null))).not.toContainEqual(
      expect.stringContaining('energy_total'),
    );
  });
});

describe('the power against the use', () => {
  const bullets = (power: PowerAgainstUse[]) =>
    blocks(null, power).filter((b) => b.type === 'bullet' || b.type === 'note');

  it('words a period whose highest power used the bill does not give', () => {
    expect(bullets([used({ maxUsed: null })])[0]).toEqual({
      type: 'bullet',
      text: expect.stringMatching(
        /^client\.bills\.electricity\.report\.official\.power_unknown \{"periodo":"client\.bills\.electricity\.report\.official\.power_period\.p1","contratada"/,
      ),
    });
  });

  it.each([
    ['without its price', { perKwYear: null }],
    ['without what the unused power costs', { unusedPerYear: null }],
  ])('words a period %s', (_title, change) => {
    expect(bullets([used(change)])[0]).toMatchObject({
      text: expect.stringMatching(
        /^client\.bills\.electricity\.report\.official\.power_period_no_price \{.*"maxima"/,
      ),
    });
  });

  it('words a period with its price, the unused power and what it costs', () => {
    expect(bullets([used()])[0]).toMatchObject({
      text: expect.stringMatching(
        /^client\.bills\.electricity\.report\.official\.power_period \{.*"contratada":"client\.bills\.unit\.kw \{\\"n\\":\\"4,6\\"\}".*"porKw".*"sobrantes".*"coste"/,
      ),
    });
  });

  it('notes a power used above the contracted one, only when it is known', () => {
    const list = texts(bullets([used({ aboveContracted: true }), used({ period: 'p2' })]));
    expect(list.filter((t) => t.includes('power_above'))).toEqual([
      expect.stringContaining(`${PREFIX}power_above {"periodo":"${PREFIX}power_in.p1"`),
    ]);
    expect(
      texts(bullets([used({ aboveContracted: true, maxUsed: null })])).some((t) =>
        t.includes('power_above'),
      ),
    ).toBe(false);
  });

  it('cites the rule of the power change, with its status', () => {
    const list = blocks(null, [used()]);
    expect(list.at(-1)).toEqual({
      type: 'source',
      text: expect.stringMatching(/ · ./),
      url: expect.stringMatching(/^https:/),
    });
  });
});
