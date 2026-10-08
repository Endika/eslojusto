import { describe, expect, it } from 'vitest';
import type {
  Confidence,
  ExtractedRow,
  ExtractedValue,
  RentalExtraction,
  SourceKind,
} from '../../src/documents/contract';
import { parseDate as d } from '../../src/engine/date';
import { regionOfPostcode, rentalPrefill, riseYear } from '../../src/rental/prefill';
import { tr } from './fixtures';

const f = (
  value: ExtractedValue,
  confidence: Confidence = 'high',
  source: SourceKind = 'lease',
) => ({
  value,
  confidence,
  source,
});
const row = (
  values: Record<string, ExtractedValue>,
  confidence: Confidence = 'high',
): ExtractedRow => ({ values, confidence });

const none = {
  guarantees: [],
  charges: [],
  utilities: [],
  notices: [],
  receipts: [],
  invoices: [],
  returns: [],
  deductions: [],
};

const extraction = (e: Partial<RentalExtraction>): RentalExtraction => ({
  pages: [],
  documents: [],
  fields: {},
  conflicts: [],
  ...none,
  ...e,
});

const prefill = (e: Partial<RentalExtraction>, answers: Record<string, string> = {}) =>
  rentalPrefill(extraction(e), answers, tr);

const entry = (p: ReturnType<typeof prefill>, name: string) =>
  p.entries.find(([n]) => n === name)?.[1];
const mark = (p: ReturnType<typeof prefill>, id: string) => p.marks.find((m) => m.id === id);

// A synthetic lease: Madrid postcode, 1.000 € a month from 20-03-2024, a cash guarantee of two
// months and the community fees passed on at 600 € a year.
const lease: RentalExtraction['fields'] = {
  signedOn: f('2024-03-15'),
  startDate: f('2024-03-20'),
  postcode: f('28013', 'medium'),
  landlordType: f('person'),
  use: f('main_home'),
  agreedMonths: f(60),
  initialRent: f(1000),
  updateClauseText: f('La renta se actualizará cada año según el IPC general.'),
  updateClauseIndex: f('ipc'),
  deposit: f(1000),
  advanceMonths: f(1),
  feesText: f('Los honorarios de la agencia los paga el arrendador.'),
  chargesClauseText: f('Los gastos de comunidad corren a cargo de la parte arrendataria.'),
};

const receipts = [
  row({ month: '2025-01', rent: 1000, community: 50, utilities: 30 }),
  row({ month: '2025-02', rent: 1000, community: 50 }),
  row({ month: '2025-03', rent: 1030, community: 50 }),
  row({ month: '2025-04', rent: 1030, community: 50 }, 'medium'),
];

describe('the contract', () => {
  const p = prefill({ fields: lease });

  it('fills its own sheets in the form’s format, each marked with its confidence', () => {
    expect(p.entries).toEqual(
      expect.arrayContaining([
        ['contractType', 'main_home'],
        ['signedOn', '2024-03-15'],
        ['startDate', '2024-03-20'],
        ['landlordType', 'person'],
        ['deposit', '1.000,00'],
        ['initialRent', '1.000,00'],
        ['agreedMonths', '60'],
        ['updateClause', 'ipc'],
      ]),
    );
    expect(mark(p, 'signedOn')).toEqual({
      id: 'signedOn',
      container: '[data-field="signedOn"]',
      confidence: 'high',
    });
    expect(p.count).toBe(p.marks.length);
  });

  it('works out the community from the postcode, and says so', () => {
    expect(entry(p, 'region')).toBe('MD');
    expect(mark(p, 'region')).toMatchObject({ confidence: 'medium', derived: true });
  });

  it('counts the first month among those paid in advance, as the form does', () => {
    expect(entry(p, 'advanceMonths')).toBe('2');
    expect(mark(p, 'advanceMonths')?.derived).toBe(true);
  });

  it('quotes the clauses word for word beside the questions they answer', () => {
    expect(p.quotes).toEqual({
      updateClause: 'La renta se actualizará cada año según el IPC general.',
      hasFees: 'Los honorarios de la agencia los paga el arrendador.',
      hasCharges: 'Los gastos de comunidad corren a cargo de la parte arrendataria.',
    });
  });

  it('takes a fixed percentage only with a fixed-percentage clause', () => {
    expect(entry(p, 'fixedPercent')).toBeUndefined();
    const fixed = prefill({
      fields: { updateClauseIndex: f('fixed_percent'), updateFixedPercent: f(3) },
    });
    expect(entry(fixed, 'fixedPercent')).toBe('3,00');
  });

  it('preselects a use other than a main home, so the gate stops it as if typed', () => {
    expect(entry(prefill({ fields: { use: f('seasonal') } }), 'contractType')).toBe('seasonal');
  });

  it('leaves unanswered what no document says', () => {
    for (const name of ['largeLandlord', 'stressedZone', 'hasUpdates', 'movedOut'])
      expect(entry(p, name)).toBeUndefined();
  });

  it('turns a guarantee stated in months into euros at the agreed rent', () => {
    const g = prefill({
      fields: lease,
      guarantees: [row({ kind: 'cash', months: 2 }), row({ kind: 'insurance', amount: 340 })],
    });
    expect(entry(g, 'hasGuarantees')).toBe('yes');
    expect(entry(g, 'guarantees.0.kind')).toBe('cash');
    expect(entry(g, 'guarantees.0.amount')).toBe('2.000,00');
    expect(mark(g, 'guarantees.0.amount')).toMatchObject({
      container: '[data-field="guarantees.0.amount"]',
      derived: true,
    });
    expect(entry(g, 'guarantees.1.amount')).toBe('340,00');
    expect(mark(g, 'guarantees.1.amount')?.derived).toBeUndefined();
  });
});

describe('rises', () => {
  const notice = row({
    noticeOn: '2025-02-01',
    medium: 'letter',
    percent: 3,
    indexNamed: 'ipc',
    previousRent: 1000,
    newRent: 1030,
    appliesFrom: '2025-03-20',
  });

  it('take the month they were charged from the first receipt at the new rent', () => {
    const p = prefill({ fields: lease, notices: [notice], receipts });
    expect(entry(p, 'hasUpdates')).toBe('yes');
    expect(p.entries.filter(([n]) => n.startsWith('updates.'))).toEqual([
      ['updates.0.year', '2025'],
      ['updates.0.chargedFrom', '2025-03-01'],
      ['updates.0.previousRent', '1.000,00'],
      ['updates.0.newRent', '1.030,00'],
      ['updates.0.notice', 'letter'],
      ['updates.0.noticeOn', '2025-02-01'],
    ]);
    expect(mark(p, 'updates.0.chargedFrom')).toMatchObject({ confidence: 'high', derived: true });
    expect(mark(p, 'updates.0.newRent')?.derived).toBeUndefined();
    // Whether it was agreed in writing is the person's to say.
    expect(entry(p, 'updates.0.agreedInWriting')).toBeUndefined();
  });

  it('without a receipt at the new rent, go by the notice’s date and ask to check it', () => {
    const p = prefill({ fields: lease, notices: [notice] });
    expect(entry(p, 'updates.0.chargedFrom')).toBe('2025-03-20');
    expect(mark(p, 'updates.0.chargedFrom')?.confidence).toBe('low');
    expect(p.notes).toContain(tr('client.documents.done_low'));
  });

  it('work out the new rent from the percentage when the notice gives only that', () => {
    const p = prefill({
      notices: [row({ previousRent: 1000, percent: 2.5, appliesFrom: '2025-03-20' })],
    });
    expect(entry(p, 'updates.0.newRent')).toBe('1.025,00');
    expect(mark(p, 'updates.0.newRent')?.derived).toBe(true);
  });

  it('come from the receipts alone when no notice speaks of them, less surely after a gap', () => {
    const p = prefill({
      fields: lease,
      receipts: [
        row({ month: '2025-02', rent: 1000 }),
        row({ month: '2025-03', rent: 1030 }),
        row({ month: '2026-05', rent: 1060 }),
      ],
    });
    expect(p.entries.filter(([n]) => /^updates\.\d\.(year|chargedFrom|newRent)$/.test(n))).toEqual([
      ['updates.0.year', '2025'],
      ['updates.0.chargedFrom', '2025-03-01'],
      ['updates.0.newRent', '1.030,00'],
      ['updates.1.year', '2026'],
      ['updates.1.chargedFrom', '2026-05-01'],
      ['updates.1.newRent', '1.060,00'],
    ]);
    expect(mark(p, 'updates.0.chargedFrom')?.confidence).toBe('high');
    expect(mark(p, 'updates.1.chargedFrom')?.confidence).toBe('low');
    expect(entry(p, 'updates.1.notice')).toBeUndefined();
  });

  it('belong to the anniversary nearest the month they were charged from', () => {
    const start = d('2024-03-20');
    expect(riseYear(start, d('2025-03-01'))).toBe(2025);
    expect(riseYear(start, d('2025-04-01'))).toBe(2025);
    expect(riseYear(start, d('2026-01-15'))).toBe(2026);
    // Never the year the contract started.
    expect(riseYear(d('2024-12-20'), d('2024-12-01'))).toBe(2025);
  });
});

describe('charges', () => {
  const p = prefill({
    fields: lease,
    charges: [row({ kind: 'community', annualAmount: 600, concept: 'Comunidad' })],
    receipts: [...receipts, row({ month: '2024-12', rent: 1000, community: 45, propertyTax: 120 })],
  });

  it('add up the receipts by concept and calendar year, with the contract’s terms first', () => {
    expect(p.entries.filter(([n]) => n.startsWith('charges.'))).toEqual([
      ['charges.0.kind', 'community'],
      ['charges.0.inContract', 'yes'],
      ['charges.0.annualAgreed', '600,00'],
      ['charges.0.year', '2024'],
      ['charges.0.amount', '45,00'],
      ['charges.1.kind', 'community'],
      ['charges.1.year', '2025'],
      ['charges.1.amount', '200,00'],
      ['charges.2.kind', 'property_tax'],
      ['charges.2.year', '2024'],
      ['charges.2.amount', '120,00'],
    ]);
    expect(mark(p, 'charges.1.amount')).toMatchObject({ confidence: 'medium', derived: true });
    // The contract says nothing of the property tax: whether it does is left to the person.
    expect(entry(p, 'charges.2.inContract')).toBeUndefined();
  });

  it('say that a year counts only the receipts read, and that other lines stay out', () => {
    expect(p.notes).toEqual(
      expect.arrayContaining([
        tr('client.rental.documents.receipt_sums'),
        tr('client.rental.documents.receipt_other_lines'),
      ]),
    );
  });

  it('keep a concept the contract passes on, with nothing charged read yet', () => {
    const c = prefill({ charges: [row({ kind: 'waste', concept: 'Basuras' })] });
    expect(c.entries.filter(([n]) => n.startsWith('charges.'))).toEqual([
      ['charges.0.kind', 'waste'],
      ['charges.0.inContract', 'yes'],
    ]);
    expect(c.notes).not.toContain(tr('client.rental.documents.receipt_sums'));
  });
});

describe('fees, from the invoices', () => {
  it('take the total, or the base and VAT added up when the total is missing', () => {
    const p = prefill({
      invoices: [
        row({ conceptKind: 'solvency_check', base: 200, vat: 42, total: 242 }),
        row({ conceptKind: 'agency_fee', base: 500, vat: 105 }, 'low'),
      ],
    });
    expect(entry(p, 'hasFees')).toBe('yes');
    expect(p.entries.filter(([n]) => n.startsWith('fees.'))).toEqual([
      ['fees.0.kind', 'solvency_check'],
      ['fees.0.amount', '242,00'],
      ['fees.1.kind', 'agency_fee'],
      ['fees.1.amount', '605,00'],
    ]);
    expect(mark(p, 'fees.1.amount')).toMatchObject({ confidence: 'low', derived: true });
  });
});

describe('moving out, from the deposit return', () => {
  const p = prefill({
    fields: { keysReturnedOn: f('2026-06-30', 'high', 'deposit_return') },
    returns: [row({ on: '2026-08-15', amount: 800 })],
    deductions: [row({ amount: 150, kind: 'cleaning' }), row({ amount: 50 })],
  });

  it('fills the exit sheet', () => {
    expect(p.entries).toEqual([
      ['movedOut', 'yes'],
      ['keysReturnedOn', '2026-06-30'],
      ['returns.0.on', '2026-08-15'],
      ['returns.0.amount', '800,00'],
      ['deductions.0.kind', 'cleaning'],
      ['deductions.0.amount', '150,00'],
      ['deductions.1.kind', 'other'],
      ['deductions.1.amount', '50,00'],
    ]);
  });

  it('marks a deduction of no known kind as «Otro», to be checked', () => {
    expect(mark(p, 'deductions.1.kind')?.confidence).toBe('low');
  });
});

it('names the document kept when the contract and the deposit return disagree on the deposit', () => {
  const p = prefill({
    fields: { deposit: f(1000) },
    conflicts: [{ field: 'deposit', sources: ['lease', 'deposit_return'] }],
  });
  expect(p.notes[0]).toBe(
    'Fianza: los documentos no dicen lo mismo. Se ha usado lo que pone el contrato; compáralo con los demás.',
  );
});

it('says when a list holds less than was read, rather than leave it out quietly', () => {
  const months = Array.from({ length: 32 }, (_, i) => {
    const m = 1 + (i % 12);
    return row({ month: `${2010 + i}-${String(m).padStart(2, '0')}`, rent: 500, waste: 10 });
  });
  const p = prefill({ receipts: months });
  expect(p.entries.filter(([n]) => /^charges\.\d+\.kind$/.test(n))).toHaveLength(30);
  expect(p.notes).toContain(tr('client.rental.documents.rows_cut'));
});

it('reads nothing into the form from an empty reading', () => {
  expect(prefill({})).toEqual({
    entries: [],
    marks: [],
    count: 0,
    lowConfidence: false,
    notes: [],
    quotes: {},
  });
});

describe('the community of a postcode', () => {
  it.each([
    ['28013', 'MD'],
    ['08001', 'CT'],
    ['01001', 'PV'],
    ['35001', 'CN'],
    ['38001', 'CN'],
    ['51001', 'CE'],
    ['52001', 'ML'],
  ])('%s is in %s', (postcode, region) => {
    expect(regionOfPostcode(postcode)).toBe(region);
  });
  it.each(['00001', '53001', '2801', 'abcde'])('%s is in none', (postcode) => {
    expect(regionOfPostcode(postcode)).toBeNull();
  });
});
