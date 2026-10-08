import { describe, expect, it } from 'vitest';
import { NORMS } from '../../src/engine/rental/data/norms';
import { example } from '../../src/content/rent-indices';
import {
  TOPIC_IDS,
  TOPIC_PATH,
  topicPage,
  type TopicId,
  type TopicPage,
} from '../../src/content/rental-topics';

const page = (id: TopicId, irav = 2.47): TopicPage =>
  topicPage(id, { norms: NORMS, checkedOn: '2026-10-08', irav, example: example() });

const text = (p: TopicPage) => JSON.stringify(p);

describe('the rental guides', () => {
  it.each(TOPIC_IDS)('%s fits the title and description a search result shows', (id) => {
    const p = page(id);
    expect([...p.title].length).toBeLessThanOrEqual(60);
    expect([...p.description].length).toBeLessThanOrEqual(155);
    expect(p.faq.length).toBeGreaterThan(0);
    expect(p.sources.length).toBeGreaterThan(0);
  });

  it('keeps each path under /alquiler/', () => {
    for (const id of TOPIC_IDS) expect(TOPIC_PATH[id]).toMatch(/^\/alquiler\/[a-z0-9-]+\/$/);
  });

  it('caps a 900 € rent at 918 € with the decree, not at the IRAV', () => {
    const rise = page('subida');
    expect(rise.h1).toBe('Cuánto te pueden subir el alquiler en 2026');
    expect(text(rise)).toContain('918,00 €');
    expect(text(rise)).toContain('no el 2,47 %');
    expect(rise.sections[0]?.table?.rows.map((r) => r.id)).toEqual([
      'ipc',
      'igc',
      'three',
      'irav',
      'two',
    ]);
    expect(text(rise)).toContain('pendiente de convalidación');
  });

  it('applies the IRAV when it is under the decree cap', () => {
    expect(text(page('subida', 1.5))).toContain('913,50 €');
  });

  it('dates the decree and links the pages it names', () => {
    const decree = page('decreto');
    expect(decree.h1).toBe('Decreto del alquiler 2026: qué cambia y en qué estado está');
    expect(text(decree)).toContain('8 de octubre de 2026');
    expect(text(decree)).toContain('5 de noviembre de 2026');
    const links = decree.sections.flatMap((s) => s.links ?? []).map((l) => l.path);
    expect(links).toContain(TOPIC_PATH.subida);
    expect(links).toContain(TOPIC_PATH.honorarios);
  });

  it('works out one month plus VAT on a 900 € rent', () => {
    const fees = page('honorarios');
    expect(fees.h1).toBe('¿Puede la inmobiliaria cobrarte a ti? Honorarios en el alquiler');
    expect(text(fees)).toContain('1.089,00 €');
    expect(text(fees)).toContain('estudio de solvencia');
  });
});
