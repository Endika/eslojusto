import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_FAQ_TOPICS } from '../../src/content/employment-faq-topics';
import { employmentFaqEntries } from '../../src/content/employment-faq';
import {
  employmentGuide,
  minimumWageSummary,
  statusCode,
} from '../../src/content/employment-guide';
import { MINIMUM_WAGE } from '../../src/engine/employment/data/minimum-wage';
import { EMPLOYMENT_NORMS } from '../../src/engine/employment/data/norms';
import type { MinimumWageTable } from '../../src/engine/employment/minimum-wage';
import type { NormTable } from '../../src/engine/employment/norms';
import { FORBIDDEN } from '../support/forbidden';

const CHECKED = '2026-10-08';
const guide = (norms: NormTable = EMPLOYMENT_NORMS, checkedOn = CHECKED, table = MINIMUM_WAGE) =>
  employmentGuide('es', norms, { checkedOn, minimumWage: table });
const text = (norms?: NormTable, checkedOn?: string, table?: MinimumWageTable) =>
  guide(norms, checkedOn, table)
    .flatMap((b) => [
      ...b.paragraphs,
      ...b.list,
      ...b.quotes.flatMap((q) => [q.lead ?? '', q.intro]),
    ])
    .join('\n');
const block = (id: string, norms?: NormTable) => guide(norms).find((b) => b.id === id);
const faq = (
  options: {
    norms?: NormTable;
    checkedOn?: string;
    table?: MinimumWageTable;
    documents?: boolean;
  } = {},
) =>
  employmentFaqEntries('es', options.norms ?? EMPLOYMENT_NORMS, {
    documents: options.documents ?? false,
    checkedOn: options.checkedOn ?? CHECKED,
    minimumWage: options.table ?? MINIMUM_WAGE,
  });
const answer = (anchor: string, options: Parameters<typeof faq>[0] = {}) =>
  faq(options).find((e) => e.anchor === anchor)?.answer ?? '';

const repealed = (id: keyof NormTable, until: string): NormTable => ({
  ...EMPLOYMENT_NORMS,
  [id]: {
    ...EMPLOYMENT_NORMS[id],
    status: 'repealed',
    inForceUntil: until,
    statusSince: until,
    statusUrl: 'https://www.boe.es/',
  },
});

// The contract page never says what a person is, nor that anyone owes them anything.
const EMPLOYMENT_FORBIDDEN = [
  /\beres fij[oa]\b/,
  /\bte convierte en fij[oa]\b/,
  /\bya eres\b/,
  /\bpasas a ser\b/,
  /\bte deben?\b/,
];

describe('the employment guide', () => {
  it('covers every block, each with its norms and a source on the BOE, listed once', () => {
    const blocks = guide();
    expect(blocks.map((b) => b.id)).toEqual([
      'minimum_wage',
      'what_counts',
      'modalities',
      'permanent',
      'trial',
      'working_time',
      'part_time',
      'holidays_pay',
      'clauses',
      'information',
      'agreement',
    ]);
    for (const b of blocks) {
      expect(b.sources.length, b.id).toBeGreaterThan(0);
      expect(
        b.sources.some((s) => s.url.startsWith('https://www.boe.es/')),
        b.id,
      ).toBe(true);
      const citations = b.sources.map((s) => s.citation);
      expect(new Set(citations).size, b.id).toBe(citations.length);
    }
    expect(new Set(blocks.map((b) => b.anchor)).size).toBe(blocks.length);
  });

  it('gives no advice and never asserts a permanent status', () => {
    const all = [text(), ...faq({ documents: true }).flatMap((e) => [e.question, e.answer])].join(
      '\n',
    );
    for (const forbidden of [...FORBIDDEN, ...EMPLOYMENT_FORBIDDEN])
      expect(all.toLowerCase()).not.toMatch(forbidden);
  });

  it('quotes art. 15.4 and 15.5 with the sentence the review uses and the BOE link', () => {
    const quotes = block('permanent')?.quotes ?? [];
    expect(quotes.map((q) => q.intro)).toEqual([
      'El artículo 15.4 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija:',
      'El artículo 15.5 del Estatuto de los Trabajadores dice que, en un caso como el tuyo, la persona adquiere la condición de fija:',
      'El artículo 8.2 del Estatuto de los Trabajadores dice:',
    ]);
    expect(quotes[0]?.text).toContain('adquirirán la condición de fijas');
    expect(quotes[0]?.url).toBe('https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430#a15');
    expect(quotes[0]?.citation).toContain('art. 15.4');
  });

  it('says the working week stays at forty hours and names no shorter one', () => {
    const all = text();
    expect(all).toContain('La jornada máxima sigue en 40 horas semanales');
    expect(all).not.toMatch(/37[,.]5/);
  });
});

describe('the minimum wage in the guide', () => {
  it('lists every year of the table, newest first, with the twelve-payment figure worked out', () => {
    const { lines } = minimumWageSummary('es', MINIMUM_WAGE, EMPLOYMENT_NORMS, CHECKED);
    expect(lines.map((l) => l.year)).toEqual(
      MINIMUM_WAGE.map((r) => r.year).toSorted((a, b) => b - a),
    );
    expect(lines[0]).toMatchObject({
      year: 2026,
      monthly: '1.221,00 €',
      twelve: '1.424,50 €',
      annual: '17.094,00 €',
      daily: '40,70 €',
      norm: 'Real Decreto 126/2026',
      url: 'https://www.boe.es/eli/es/rd/2026/02/18/126/con',
    });
    expect(lines[0]?.status.status).toBe('en vigor');
    expect(lines[1]?.status.status).toBe('con efectos hasta el 31-12-2025');
  });

  it('reads every figure from the table it is given', () => {
    const raised: MinimumWageTable = MINIMUM_WAGE.map((r) =>
      r.year === 2026 ? { ...r, monthly: 1300, annual: 18200, temporaryPerDay: 61.5 } : r,
    );
    const all = text(EMPLOYMENT_NORMS, CHECKED, raised);
    expect(minimumWageSummary('es', raised, EMPLOYMENT_NORMS, CHECKED).current).toContain(
      '1.300,00\u00a0€ al mes en 14 pagas, 18.200,00\u00a0€ al año',
    );
    expect(all).toContain('61,50 € en 2026');
    expect(answer('faq-contrato-smi', { table: raised })).toContain('1.300,00 €');
    expect(answer('faq-contrato-tiempo-parcial', { table: raised })).toContain('9.100,00 €');
  });

  it('in 2027, before its decree, says the year is not out and names the reference year', () => {
    const { current } = minimumWageSummary('es', MINIMUM_WAGE, EMPLOYMENT_NORMS, '2027-01-20');
    expect(current).toBe(
      'El SMI de 2027 aún no se ha publicado en el BOE. Hasta que salga, la revisión usa el de 2026 solo como referencia y no da diferencia para 2027.',
    );
    const entries = faq({ checkedOn: '2027-01-20' });
    expect(entries[0]?.question).toBe('¿Cuál es el salario mínimo en 2027?');
    expect(entries[0]?.answer).toContain('El SMI de 2027 aún no se ha publicado en el BOE');
    expect(entries[0]?.answer).toContain('El último publicado es el de 2026');
  });

  it('takes a 2027 row as soon as it is in the table', () => {
    const latest = MINIMUM_WAGE.at(-1);
    if (!latest) throw new Error('no table');
    const with2027: MinimumWageTable = [
      ...MINIMUM_WAGE,
      { ...latest, year: 2027, monthly: 1250, annual: 17500, publishedOn: '2027-02-10' },
    ];
    const { current, lines } = minimumWageSummary('es', with2027, EMPLOYMENT_NORMS, '2027-03-01');
    expect(lines[0]?.year).toBe(2027);
    expect(current).toContain('En 2027, el SMI es de 1.250,00 € al mes en 14 pagas');
  });
});

describe('the guide follows how each norm stands', () => {
  it('names RD 723/2026 in force, and only its repeal once repealed', () => {
    const info = (norms?: NormTable) => block('information', norms);
    expect(info()?.paragraphs[0]).toBe(
      'Desde el 5 de octubre de 2026, el Real Decreto 723/2026 dice que la empresa tiene que darte por escrito los elementos esenciales de tu relación laboral (art. 3.2):',
    );
    expect(info()?.list).toHaveLength(17);
    const after = info(repealed('rd723_2026', '2027-06-30'));
    expect(after?.paragraphs).toEqual([
      'La norma Real Decreto 723/2026 se aplicó del 05-10-2026 al 30-06-2027 y después se derogó: la revisión ya no la aplica.',
    ]);
    expect(after?.list).toEqual([]);
    expect(after?.sources[0]?.status).toBe('derogada el 30-06-2027');
    expect(
      answer('faq-contrato-informacion', { norms: repealed('rd723_2026', '2027-06-30') }),
    ).toBe(
      'La norma Real Decreto 723/2026 se aplicó del 05-10-2026 al 30-06-2027 y después se derogó: la revisión ya no la aplica.',
    );
  });

  it('says a norm repealed before it took effect never applied', () => {
    const never = repealed('rd723_2026', '2026-10-01');
    expect(statusCode(never.rd723_2026, CHECKED)).toBe('never_applied');
    expect(block('information', never)?.paragraphs[0]).toBe(
      'La norma Real Decreto 723/2026 no llegó a aplicarse: se derogó antes de entrar en vigor.',
    );
    expect(block('information', never)?.sources[0]?.status).toBe('derogada antes de aplicarse');
  });

  it('says when a norm is still to take effect or awaits validation', () => {
    const upcoming = guide(EMPLOYMENT_NORMS, '2026-10-01');
    expect(upcoming.find((b) => b.id === 'information')?.paragraphs[0]).toContain(
      'el Real Decreto 723/2026, que entra en vigor el 5 de octubre de 2026,',
    );
    expect(upcoming.find((b) => b.id === 'information')?.sources[0]?.status).toBe(
      'en vigor desde el 05-10-2026',
    );
    const pending: NormTable = {
      ...EMPLOYMENT_NORMS,
      law1_2025: { ...EMPLOYMENT_NORMS.law1_2025, status: 'pending_validation' },
    };
    expect(block('modalities', pending)?.list.join(' ')).toContain(
      'la Ley 1/2025, en vigor desde el 2 de enero de 2025 y pendiente de convalidación, amplía ese límite a 120 días',
    );
  });

  it('drops the agri-food extension once Ley 1/2025 is repealed, keeping the 90 days', () => {
    const list = block('modalities', repealed('law1_2025', '2027-01-01'))?.list.join(' ') ?? '';
    expect(list).toContain('hasta 90 días en el año natural');
    expect(list).toContain('La norma Ley 1/2025 se aplicó del 02-01-2025 al 01-01-2027');
    expect(list).not.toContain('amplía ese límite');
  });
});

describe('the employment FAQ', () => {
  it('asks about documents and the pass only with the documents API', () => {
    expect(faq({ documents: true }).map((e) => e.anchor)).toEqual(
      EMPLOYMENT_FAQ_TOPICS.map(([, a]) => a),
    );
    const plain = faq().map((e) => e.question);
    expect(plain).not.toContain('¿Qué pasa con mis documentos?');
    expect(plain).not.toContain('¿Qué incluye el pase de 4,99 €?');
    expect(plain).toContain('¿Cuál es el salario mínimo en 2026?');
  });

  it('every answer is filled in', () => {
    for (const e of faq({ documents: true })) {
      expect(e.answer, e.anchor).not.toMatch(/[{}]/);
      expect(e.answer.length, e.anchor).toBeGreaterThan(40);
    }
  });

  it('dates the latest decree in the January answer from the table', () => {
    expect(answer('faq-contrato-enero')).toContain(
      'El de 2026 se publicó en el BOE el 19 de febrero de 2026, con efectos desde el 1 de enero de 2026.',
    );
  });
});
