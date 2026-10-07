import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HUBS, LANDINGS, LANDING_IDS } from '../../src/content/landings';
import { LAST_UPDATED } from '../../src/content/updated';
import { euroRange, wholeEuroRange } from '../../src/content/format';

const pages = LANDING_IDS.map((id) => [id, LANDINGS[id]] as const);
const unique = (values: readonly string[]) => new Set(values).size === values.length;

describe('the case pages', () => {
  it.each(pages)('%s keeps its title and description within what Google shows', (_, page) => {
    expect([...page.title].length).toBeLessThanOrEqual(60);
    expect([...page.description].length).toBeLessThanOrEqual(155);
  });

  it('no two pages share a path, a title, a heading or a description', () => {
    for (const field of ['path', 'title', 'h1', 'description', 'name', 'guideTitle'] as const)
      expect(unique(pages.map(([, p]) => p[field])), field).toBe(true);
  });

  it.each(pages)('%s has its source file, its sitemap date and its questions', (_, page) => {
    expect(page.path).toMatch(/^\/[a-z-]+\/([a-z-]+\/)?$/);
    expect(existsSync(`src/pages${page.path}index.astro`)).toBe(true);
    expect(LAST_UPDATED[page.path]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(page.faq.length).toBeGreaterThanOrEqual(3);
    expect(unique(page.faq.map((q) => q.question))).toBe(true);
  });

  it.each(pages)('%s links to its hub and to pages that exist, never to itself', (id, page) => {
    expect(Object.values(HUBS).map((h) => h.path)).toContain(HUBS[page.hub].path);
    expect(page.related).not.toContain(id);
    for (const r of page.related) expect(LANDINGS[r]).toBeDefined();
  });

  it('every answer cites its law, says what the review does, or says it only informs', () => {
    for (const [, page] of pages)
      for (const { question, answer } of page.faq)
        expect(answer, question).toMatch(
          /\b(ET|LGSS|SEPE)\b|esta revisión|La revisión|solo como información|Orden PJC/,
        );
  });

  it('the paro pages show the estimate first; the finiquito pages, the items', () => {
    for (const [, page] of pages) expect(page.benefitFirst).toBe(page.hub === 'paro');
  });

  it('the content module gives no advice', () => {
    const text = readFileSync('src/content/landings.ts', 'utf8').toLowerCase();
    for (const forbidden of [/\bfirma(lo)?\b/, /\breclama(lo)?\b/, /\bdemanda\b/, /\bno firmes\b/])
      expect(text).not.toMatch(forbidden);
  });
});

describe('figures in words', () => {
  it('a range reads «entre … y …», a single figure alone', () => {
    expect(euroRange({ min: 750, max: 750 })).toMatch(/^750,00\s€$/);
    expect(euroRange({ min: 725.81, max: 750 })).toMatch(/^entre 725,81\s€ y 750,00\s€$/);
    expect(wholeEuroRange({ min: 2625, max: 2685.05 })).toMatch(/^2\.625–2\.685\s€$/);
  });
});
