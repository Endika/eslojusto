import { describe, expect, it } from 'vitest';
import { parseReading } from '../src/domain/extraction';
import { SECTIONS } from '../src/domain/extraction-schema';
import { groupDocuments, merge } from '../src/domain/merge';
import { f, page, proposal } from './support/fields';

const line = (concept: string, amount: number, category: string, confidence = 'high') => ({
  concept,
  amount,
  category,
  confidence,
});

// With no pages given, one page of each kind the sections need, as a real read would have.
function pack(input: Record<string, unknown>, pages: number) {
  const given = input['pages'] as unknown[];
  if (given.length > 0) return merge(parseReading(input, pages));
  const kinds = [
    ...new Set(
      Object.keys(input)
        .filter((k): k is keyof typeof SECTIONS => k in SECTIONS)
        .map((k) => SECTIONS[k].source),
    ),
  ];
  return merge(
    parseReading({ ...input, pages: kinds.map((k, i) => page(i + 1, k)) }, kinds.length),
  );
}

describe('merge', () => {
  it('keeps each value with the kind of document it came from', () => {
    const m = pack(
      {
        pages: [page(1, 'dismissal_letter'), page(2, 'payslip', 2, 'high', '2026-08')],
        dismissal_letter: { endDate: f('2026-09-15'), noticeDaysReceived: f(15, 'medium') },
        monthly_payslip: { periodStart: f('2026-08-01'), totalAccrued: f(1980) },
      },
      2,
    );
    expect(m.fields).toEqual({
      endDate: { ...f('2026-09-15'), source: 'dismissal_letter' },
      noticeDaysReceived: { ...f(15, 'medium'), source: 'dismissal_letter' },
      payslipPeriodStart: { ...f('2026-08-01'), source: 'payslip' },
      payslipTotalAccrued: { ...f(1980), source: 'payslip' },
    });
    expect(m.conflicts).toEqual([]);
  });

  it('prefers the settlement proposal, then the final payslip, then the letter for items', () => {
    const letterOnly = pack(
      {
        pages: [],
        dismissal_letter: { severance: f(900) },
        settlement_agreement: { severanceTotal: f(8000) },
      },
      0,
    );
    expect(letterOnly.fields.severance).toEqual({ ...f(900), source: 'dismissal_letter' });
    // What an agreement offers is its own field, never the final pay's severance.
    expect(letterOnly.fields.agreementSeveranceTotal).toEqual({
      ...f(8000),
      source: 'settlement_agreement',
    });
    expect(letterOnly.conflicts).toEqual([]);
    const all = pack(
      {
        pages: [],
        dismissal_letter: { severance: f(900) },
        final_payslip: { lines: [line('INDEMNIZACION', 800, 'severance')] },
        settlement_proposal: { severance: f(700) },
      },
      0,
    );
    expect(all.fields.severance).toEqual({ ...f(700), source: 'settlement_proposal' });
    expect(all.conflicts).toEqual([
      { field: 'severance', sources: ['settlement_proposal', 'payslip', 'dismissal_letter'] },
    ]);
  });

  it('lets an agreement decide the cause, and flags the letter that said otherwise', () => {
    const m = pack(
      {
        pages: [],
        dismissal_letter: { cause: f('disciplinary_dismissal') },
        settlement_agreement: { cause: f('unfair_dismissal') },
      },
      0,
    );
    expect(m.fields.cause).toEqual({ ...f('unfair_dismissal'), source: 'settlement_agreement' });
    expect(m.conflicts).toEqual([
      { field: 'cause', sources: ['settlement_agreement', 'dismissal_letter'] },
    ]);
  });

  it('does not call amounts within a euro of each other a conflict', () => {
    const m = pack(
      {
        pages: [],
        settlement_proposal: { holiday_pay: f(640.5) },
        final_payslip: { holiday_pay: f(641) },
      },
      0,
    );
    expect(m.conflicts).toEqual([]);
  });

  it('takes the work history’s rows as the other contracts', () => {
    const m = pack(
      {
        pages: [page(1, 'work_history')],
        work_history: { contracts: [{ startDate: '2020-01-01', confidence: 'high' }] },
      },
      1,
    );
    expect(m.lists.contracts).toEqual([
      { values: { startDate: '2020-01-01' }, confidence: 'high', source: 'work_history' },
    ]);
    expect(pack({ pages: [], settlement_proposal: proposal() }, 0).lists).toEqual({});
  });
});

describe('the final payslip’s lines', () => {
  // A synthetic final payslip, 1–24 June: the salary pending is the sum of the salary lines
  // (1,920.50); the notice line and a one-off line stay out of it.
  const june = [
    line('SALARIO BASE', 1500, 'salary'),
    line('PP PAGAS EXTRAS', 250, 'salary'),
    line('PLUS TRANSPORTE', 60, 'salary'),
    line('PLUS CONVENIO', 90.5, 'salary', 'medium'),
    line('GASTOS TELETRABAJO', 20, 'salary'),
    line('FALTA DE PREAVISO', 1100, 'notice_compensation'),
    line('AYUDA ESTUDIOS', 150, 'one_off'),
  ];

  it('adds up the salary lines into the salary pending, and notice from its own line', () => {
    const m = pack(
      {
        pages: [page(1, 'payslip')],
        final_payslip: {
          periodStart: f('2026-06-01'),
          periodEnd: f('2026-06-24'),
          lines: june,
        },
      },
      1,
    );
    expect(m.fields.pending_salary).toEqual({ ...f(1920.5, 'medium'), source: 'payslip' });
    expect(m.fields.employer_notice).toEqual({ ...f(1100), source: 'payslip' });
    expect(m.fields.severance).toBeUndefined();
    expect(m.fields.holiday_pay).toBeUndefined();
  });

  it('wins over the settlement for the salary pending, and still flags the difference', () => {
    // A settlement that names the month's salary without its amount: the model borrowed a
    // one-off line's 150.
    const m = pack(
      {
        pages: [],
        settlement_proposal: { pending_salary: f(150) },
        final_payslip: { lines: june },
      },
      0,
    );
    expect(m.fields.pending_salary).toEqual({ ...f(1920.5, 'medium'), source: 'payslip' });
    expect(m.conflicts).toEqual([
      { field: 'pending_salary', sources: ['payslip', 'settlement_proposal'] },
    ]);
    const settlementOnly = pack(
      { pages: [], settlement_proposal: { pending_salary: f(1920.5) } },
      0,
    );
    expect(settlementOnly.fields.pending_salary?.source).toBe('settlement_proposal');
  });

  it('gives way to a settlement proposal that prints the other items, and flags the difference', () => {
    const m = pack(
      {
        pages: [],
        settlement_proposal: { holiday_pay: f(500), pending_salary: f(1920.5) },
        final_payslip: {
          lines: [...june, line('VACACIONES NO DISFRUTADAS', 640.5, 'holiday_pay')],
        },
      },
      0,
    );
    expect(m.fields.pending_salary?.value).toBe(1920.5);
    expect(m.fields.holiday_pay).toEqual({ ...f(500), source: 'settlement_proposal' });
    expect(m.conflicts).toEqual([
      { field: 'holiday_pay', sources: ['settlement_proposal', 'payslip'] },
    ]);
  });

  it('tells from a monthly payslip’s lines whether a full extra payment was paid', () => {
    const paid = pack(
      {
        pages: [],
        monthly_payslip: {
          lines: [
            line('SALARIO BASE', 1500, 'salary'),
            line('PAGA EXTRA VERANO', 1500, 'extra_pay'),
          ],
        },
      },
      0,
    );
    expect(paid.fields.extraPayPaid?.value).toBe(true);
    expect(paid.fields.extraPayAmount?.value).toBe(1500);
    const none = pack(
      { pages: [], monthly_payslip: { lines: [line('SALARIO BASE', 1500, 'salary')] } },
      0,
    );
    expect(none.fields.extraPayPaid?.value).toBe(false);
    expect(none.fields.extraPayAmount).toBeUndefined();
  });
});

describe('sections and pages', () => {
  it('drops a section no page of its kind backs', () => {
    const input = {
      pages: [page(1, 'other'), page(2, 'other')],
      settlement_agreement: { cause: f('unfair_dismissal'), severanceTotal: f(1000) },
    };
    const r = parseReading(input, 2);
    expect(r.sections).toEqual({});
    expect(r.dropped).toBe(1);
    expect(merge(r).fields).toEqual({});
  });

  it('needs a payslip page for either payslip section', () => {
    const r = parseReading(
      {
        pages: [page(1, 'dismissal_letter')],
        final_payslip: { periodStart: f('2026-09-01') },
        monthly_payslip: { periodStart: f('2026-08-01') },
      },
      1,
    );
    expect(r.sections).toEqual({});
    expect(r.dropped).toBe(2);
  });
});

describe('conflicts', () => {
  it('come only from a sure loser; an unsure one is dropped and counted', () => {
    const lines = [line('SALARIO BASE', 1500, 'salary'), line('PLUS CONVENIO', 90.5, 'salary')];
    // A settlement that names the month's salary without its amount: a stray 150, or 0.
    const unsure = (value: number, confidence: 'medium' | 'low') =>
      pack(
        {
          pages: [],
          settlement_proposal: { pending_salary: f(value, confidence) },
          final_payslip: { lines },
        },
        0,
      );
    for (const m of [unsure(150, 'medium'), unsure(0, 'low')]) {
      expect(m.fields.pending_salary?.value).toBe(1590.5);
      expect(m.conflicts).toEqual([]);
      expect(m.discarded).toBe(1);
    }
    const sure = pack(
      { pages: [], settlement_proposal: { pending_salary: f(1600) }, final_payslip: { lines } },
      0,
    );
    expect(sure.conflicts).toEqual([
      { field: 'pending_salary', sources: ['payslip', 'settlement_proposal'] },
    ]);
    expect(sure.discarded).toBe(0);
  });

  it('are never between two documents of one kind', () => {
    const m = pack(
      {
        pages: [],
        final_payslip: { startDate: f('2020-01-01') },
        monthly_payslip: { startDate: f('2021-01-01') },
      },
      0,
    );
    expect(m.fields.startDate?.value).toBe('2020-01-01');
    expect(m.conflicts).toEqual([]);
  });
});

describe('notice in a dismissal letter', () => {
  it('keeps the days given apart from the days paid instead', () => {
    const m = pack(
      {
        pages: [page(1, 'dismissal_letter')],
        dismissal_letter: { noticeDaysReceived: f(0), noticeDaysPaid: f(15) },
      },
      1,
    );
    expect(m.fields.noticeDaysReceived).toEqual({ ...f(0), source: 'dismissal_letter' });
    expect(m.fields.noticeDaysPaid).toEqual({ ...f(15), source: 'dismissal_letter' });
  });

  it('tells the model the difference in so many words', () => {
    const { noticeDaysReceived, noticeDaysPaid } = SECTIONS.dismissal_letter.fields;
    expect(noticeDaysReceived.description).toMatch(/actually GIVEN/);
    expect(noticeDaysReceived.description).toMatch(/0 when .* same day .* paid/);
    expect(noticeDaysReceived.description).toMatch(/Never the days of notice paid/);
    expect(noticeDaysPaid.description).toMatch(/PAID instead of given/);
  });
});

describe('groupDocuments', () => {
  it('joins consecutive pages of one document and nothing else', () => {
    const r = parseReading(
      {
        pages: [
          page(1, 'dismissal_letter', 1),
          page(2, 'dismissal_letter', 1),
          page(3, 'payslip', 2, 'high', '2026-08'),
          page(4, 'payslip', 3, 'high', '2026-07'),
          page(5, 'other', 4),
          page(6, 'dismissal_letter', 1),
        ],
      },
      6,
    );
    expect(groupDocuments(r.pages)).toEqual([
      { kind: 'dismissal_letter', pages: [1, 2] },
      { kind: 'payslip', pages: [3], month: '2026-08' },
      { kind: 'payslip', pages: [4], month: '2026-07' },
      { kind: 'other', pages: [5] },
      { kind: 'dismissal_letter', pages: [6] },
    ]);
  });

  it('does not join across a page the model left out', () => {
    const r = parseReading({ pages: [page(1, 'other', 1), page(3, 'other', 1)] }, 3);
    expect(groupDocuments(r.pages)).toEqual([
      { kind: 'other', pages: [1] },
      { kind: 'other', pages: [3] },
    ]);
  });
});
