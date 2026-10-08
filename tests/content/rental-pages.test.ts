import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RENTAL_PAGES,
  RENTAL_PAGE_IDS,
  chargesExample,
  decreeStatus,
  depositExample,
  depositReturnExample,
} from '../../src/content/rental-pages';
import { NORMS } from '../../src/engine/rental/data/norms';

const pages = RENTAL_PAGE_IDS.map((id) => [id, RENTAL_PAGES[id]] as const);
const unique = (values: readonly string[]) => new Set(values).size === values.length;

describe('the rental deposit and charges pages', () => {
  it.each(pages)('%s keeps its title and description within what Google shows', (_, page) => {
    expect([...page.title].length).toBeLessThanOrEqual(60);
    expect([...page.description].length).toBeLessThanOrEqual(155);
  });

  it('no two pages share a path, a title, a heading or a description', () => {
    for (const field of ['path', 'slug', 'title', 'h1', 'description', 'name'] as const)
      expect(unique(pages.map(([, p]) => p[field])), field).toBe(true);
  });

  it.each(pages)('%s has its path, its questions and links to pages that exist', (id, page) => {
    expect(page.path).toBe(`/alquiler/${page.slug}/`);
    expect(page.faq.length).toBeGreaterThanOrEqual(3);
    expect(unique(page.faq.map((q) => q.question))).toBe(true);
    expect(page.related).not.toContain(id);
    for (const r of page.related) expect(RENTAL_PAGES[r]).toBeDefined();
  });

  it('the routes exist only behind the rental switch', () => {
    const route = readFileSync('src/pages/alquiler/[money]/index.astro', 'utf8');
    expect(route).toContain('RENTAL_BUILD');
    expect(existsSync('src/views/RentalTopic.astro')).toBe(true);
  });

  it('the headings are the ones the pages target', () => {
    expect(RENTAL_PAGES.deposit_return.h1).toBe(
      'Tu casero no te devuelve la fianza: plazo e intereses',
    );
    expect(RENTAL_PAGES.deposit.h1).toBe('Fianza del alquiler: cuánto pueden pedirte');
    expect(RENTAL_PAGES.charges.h1).toBe('IBI, comunidad y basura: qué puede cobrarte tu casero');
  });

  it('says how the decree stands from the norm table', () => {
    expect(decreeStatus({ ...NORMS.rdl29_2026, status: 'pending_validation' })).toBe(
      'pendiente de convalidación',
    );
    expect(decreeStatus({ ...NORMS.rdl29_2026, status: 'in_force' })).toBe(
      'convalidado por el Congreso',
    );
  });
});

describe('the worked examples', () => {
  it('works out the interest across the year change, one rate for each year', () => {
    const ex = depositReturnExample();
    expect(ex.interestFrom).toBe('2022-12-16');
    expect(ex.stretches.map((s) => [s.from, s.to, s.days, s.rate])).toEqual([
      ['2022-12-16', '2022-12-31', 16, 3],
      ['2023-01-01', '2023-03-19', 78, 3.25],
    ]);
    // 900 × 3 % × 16 ÷ 365 = 1,18 and 900 × 3,25 % × 78 ÷ 365 = 6,25.
    expect(ex.stretches.map((s) => s.interest)).toEqual([1.18, 6.25]);
    expect(ex.total).toBe(7.43);
    expect(ex.totalCommercial).toBeGreaterThan(ex.total);
  });

  it('puts 3.600 € asked on a 900 € rent 900 € over the cap', () => {
    expect(depositExample()).toEqual({ rent: 900, asked: 3600, allowed: 2700, over: 900 });
  });

  it('puts a charge above its agreed yearly amount over by the difference', () => {
    expect(chargesExample()).toEqual({ agreed: 600, charged: 720, over: 120 });
  });
});
