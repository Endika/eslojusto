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
    // Read with high confidence, but whether the contract counted the first month is less sure.
    expect(mark(p, 'advanceMonths')).toMatchObject({ confidence: 'medium', derived: true });
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
        row({ month: '2025-04', rent: 1030 }),
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
    // Charged before its anniversary, the rise belongs to it, but less surely.
    expect(mark(p, 'updates.0.year')?.confidence).toBe('low');
    expect(mark(p, 'updates.1.chargedFrom')?.confidence).toBe('low');
    expect(entry(p, 'updates.1.notice')).toBeUndefined();
  });

  it('belong to the anniversary of a rise charged late, never the next one', () => {
    // 20-03-2024 start; noticed on 01-09-2025 and first charged in October 2025.
    const p = prefill({
      fields: lease,
      notices: [
        row({ noticeOn: '2025-09-01', medium: 'letter', previousRent: 1000, newRent: 1030 }),
      ],
      receipts: [
        row({ month: '2025-09', rent: 1000 }),
        row({ month: '2025-10', rent: 1030 }),
        row({ month: '2025-11', rent: 1030 }),
      ],
    });
    expect(entry(p, 'updates.0.year')).toBe('2025');
    expect(mark(p, 'updates.0.year')?.confidence).toBe('high');
    expect(entry(p, 'updates.0.chargedFrom')).toBe('2025-10-01');
  });

  it('belong to the latest anniversary on or before the day they apply from', () => {
    const start = d('2024-03-20');
    expect(riseYear(start, d('2025-10-01'))).toEqual({ year: 2025, early: false });
    expect(riseYear(start, d('2025-03-20'))).toEqual({ year: 2025, early: false });
    expect(riseYear(start, d('2026-01-15'))).toEqual({ year: 2025, early: false });
    // Only just before an anniversary does a rise belong to it, and less surely.
    expect(riseYear(start, d('2025-03-01'))).toEqual({ year: 2025, early: true });
    expect(riseYear(start, d('2026-02-18'))).toEqual({ year: 2026, early: true });
    expect(riseYear(start, d('2026-02-16'))).toEqual({ year: 2025, early: false });
    // Never the year the contract started.
    expect(riseYear(d('2024-12-20'), d('2024-12-01'))).toEqual({ year: 2025, early: true });
  });

  it('go by the notice’s day when it says when the rise applies', () => {
    const p = prefill({
      fields: lease,
      notices: [row({ newRent: 1030, appliesFrom: '2025-03-20' })],
      receipts: [row({ month: '2025-02', rent: 1000 }), row({ month: '2025-03', rent: 1030 })],
    });
    expect(entry(p, 'updates.0.year')).toBe('2025');
    expect(mark(p, 'updates.0.year')?.confidence).toBe('high');
  });

  it('match a notice to the receipts within a euro, or by the month it applies from', () => {
    const rounded = prefill({
      fields: lease,
      notices: [row({ previousRent: 1000, newRent: 1030.4, appliesFrom: '2025-03-20' })],
      receipts: [row({ month: '2025-02', rent: 1000 }), row({ month: '2025-03', rent: 1030 })],
    });
    expect(rounded.entries.filter(([n]) => n.endsWith('.chargedFrom'))).toEqual([
      ['updates.0.chargedFrom', '2025-03-01'],
    ]);
    const byMonth = prefill({
      fields: lease,
      notices: [row({ previousRent: 1000, newRent: 1050, appliesFrom: '2025-03-20' })],
      receipts: [row({ month: '2025-02', rent: 1000 }), row({ month: '2025-03', rent: 1030 })],
    });
    expect(byMonth.entries.filter(([n]) => n.endsWith('.chargedFrom'))).toEqual([
      ['updates.0.chargedFrom', '2025-03-01'],
    ]);
  });

  it('never count a prorated or one-off month as a rise', () => {
    const p = prefill({
      fields: lease,
      receipts: [
        row({ month: '2024-03', rent: 387.1 }),
        row({ month: '2024-04', rent: 1000 }),
        row({ month: '2024-05', rent: 1000 }),
        row({ month: '2024-06', rent: 1250 }),
        row({ month: '2024-07', rent: 1000 }),
      ],
    });
    expect(entry(p, 'hasUpdates')).toBeUndefined();
  });

  it('take the last receipt’s new rent as a change, with nothing after it', () => {
    const p = prefill({
      fields: lease,
      receipts: [row({ month: '2025-02', rent: 1000 }), row({ month: '2025-03', rent: 1030 })],
    });
    expect(entry(p, 'updates.0.newRent')).toBe('1.030,00');
  });

  it('leave a rent that went down off the sheet, and say so', () => {
    const p = prefill({
      fields: lease,
      notices: [row({ previousRent: 1000, newRent: 980, appliesFrom: '2025-03-20' })],
      receipts: [
        row({ month: '2025-02', rent: 1000 }),
        row({ month: '2025-03', rent: 980 }),
        row({ month: '2025-04', rent: 980 }),
      ],
    });
    expect(entry(p, 'hasUpdates')).toBeUndefined();
    expect(p.entries.some(([n]) => n.startsWith('updates.'))).toBe(false);
    expect(p.notes).toContain(tr('client.rental.documents.decrease'));
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

it('counts each month once in the charges, and flags two receipts that disagree', () => {
  const year = Array.from({ length: 12 }, (_, i) =>
    row({ month: `2025-${String(i + 1).padStart(2, '0')}`, rent: 1000, community: 50 }),
  );
  const same = prefill({
    receipts: [...year, row({ month: '2025-06', rent: 1000, community: 50 })],
  });
  expect(entry(same, 'charges.0.amount')).toBe('600,00');
  expect(same.notes).not.toContain(tr('client.rental.documents.receipt_duplicate'));

  const other = prefill({
    receipts: [
      row({ month: '2025-06', rent: 1000, community: 80 }),
      ...year.map((r) => ({ ...r, source: 'rent_receipt' as const })),
    ],
  });
  // The receipt document's row is kept over the other, and the month made less sure.
  expect(entry(other, 'charges.0.amount')).toBe('600,00');
  expect(mark(other, 'charges.0.amount')?.confidence).toBe('low');
  expect(other.notes).toContain(tr('client.rental.documents.receipt_duplicate'));
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

  it('are to be checked when an invoice does not add up, as the API found', () => {
    const invoices = [
      row({ conceptKind: 'solvency_check', base: 200, vat: 42, total: 242 }),
      row({ conceptKind: 'agency_fee', base: 500, vat: 105, total: 650 }),
    ];
    const p = rentalPrefill(extraction({ invoices }), {}, tr, ['invoice_total_mismatch']);
    expect(mark(p, 'fees.0.amount')?.confidence).toBe('high');
    expect(mark(p, 'fees.1.amount')?.confidence).toBe('low');
    expect(p.notes).toContain(tr('client.rental.documents.check.invoice_total_mismatch'));
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

it('words the rental checks the API found, and leaves the final pay’s to the upload', () => {
  const p = rentalPrefill(extraction({}), {}, tr, ['return_before_keys', 'items_do_not_sum']);
  expect(p.notes).toEqual([tr('client.rental.documents.check.return_before_keys')]);
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
