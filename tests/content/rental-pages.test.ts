import { describe, expect, it } from 'vitest';
import {
  RENTAL_PAGES,
  RENTAL_PAGE_IDS,
  chargesExample,
  depositExample,
  depositReturnExample,
  nextPages,
  rentalPage,
  type RentalPage,
  type RentalPageId,
} from '../../src/content/rental-pages';
import { NORMS } from '../../src/engine/rental/data/norms';
import type { NormTable } from '../../src/engine/rental/norms';
import { example } from '../../src/content/rent-indices';
import { NORMS_BEFORE_VOTE } from '../engine/rental/norms-before-vote';

const page = (id: RentalPageId, irav = 2.47): RentalPage =>
  rentalPage(id, { norms: NORMS, checkedOn: '2026-11-18', irav, example: example() });
const pageBeforeVote = (id: RentalPageId): RentalPage =>
  rentalPage(id, {
    norms: NORMS_BEFORE_VOTE,
    checkedOn: '2026-10-08',
    irav: 2.47,
    example: example(),
  });
const repealedDecree: NormTable = {
  ...NORMS,
  rdl29_2026: {
    ...NORMS.rdl29_2026,
    status: 'repealed',
    inForceUntil: '2026-11-05',
    statusSince: '2026-11-06',
    statusUrl: 'https://www.boe.es/',
  },
};

const pages = RENTAL_PAGE_IDS.map((id) => [id, page(id)] as const);
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const text = (p: RentalPage) => JSON.stringify(p);

describe('the rental pages', () => {
  it.each(pages)('%s keeps its title and description within what Google shows', (_, p) => {
    expect([...p.title].length).toBeLessThanOrEqual(60);
    expect([...p.description].length).toBeLessThanOrEqual(155);
  });

  it('no two pages share a path, a title, a heading or a description', () => {
    for (const field of ['path', 'slug', 'title', 'h1', 'description', 'name', 'crumb'] as const)
      expect(unique(pages.map(([, p]) => p[field])), field).toBe(true);
  });

  it.each(pages)('%s has its path, its questions and its sources', (id, p) => {
    expect(p.path).toBe(`/alquiler/${p.slug}/`);
    expect(p.faq.length).toBeGreaterThanOrEqual(3);
    expect(unique(p.faq.map((q) => q.question))).toBe(true);
    expect(p.sources.length).toBeGreaterThan(0);
    expect(RENTAL_PAGES[id]).toBeDefined();
  });

  it('points every page to the hub, the indices and the other five', () => {
    for (const id of RENTAL_PAGE_IDS) {
      const paths = nextPages(id).map((n) => n.path);
      expect(paths.slice(0, 2)).toEqual(['/alquiler/', '/alquiler/irav-ipc/']);
      expect(paths).not.toContain(RENTAL_PAGES[id].path);
      expect(paths.slice(2).toSorted()).toEqual(
        RENTAL_PAGE_IDS.filter((o) => o !== id)
          .map((o) => RENTAL_PAGES[o].path)
          .toSorted(),
      );
    }
  });

  it('has the headings the pages target', () => {
    expect(RENTAL_PAGES.deposit_return.h1).toBe(
      'Tu casero no te devuelve la fianza: plazo e intereses',
    );
    expect(RENTAL_PAGES.deposit.h1).toBe('Fianza del alquiler: cuánto pueden pedirte');
    expect(RENTAL_PAGES.charges.h1).toBe('IBI, comunidad y basura: qué puede cobrarte tu casero');
    expect(RENTAL_PAGES.rise.h1).toBe('Cuánto te pueden subir el alquiler en 2026');
    expect(RENTAL_PAGES.decree.h1).toBe(
      'Real Decreto-ley 29/2026 del alquiler: qué cambia y en qué estado está',
    );
    expect(RENTAL_PAGES.fees.h1).toBe(
      '¿Puede la inmobiliaria cobrarte a ti? Honorarios en el alquiler',
    );
  });
});

describe('the rise, decree and fees pages', () => {
  it('caps a 900 € rent at 918 € with the decree, not at the IRAV', () => {
    const rise = page('rise');
    expect(text(rise)).toContain('918,00 €');
    expect(text(rise)).toContain('no el 2,47 %');
    expect(rise.sections?.[0]?.caps?.map((r) => r.id)).toEqual([
      'ipc',
      'igc',
      'three',
      'irav',
      'two',
    ]);
    expect(text(rise)).not.toContain('pendiente');
  });

  it('says plainly that the 2 % account applies once the decree is validated', () => {
    const example = page('rise').sections?.find((s) => s.id === 'ejemplo');
    expect(example?.example).toHaveLength(1);
    expect(example?.example?.[0]).toContain('el tope sin nuevo pacto es el 2\u00a0%');
    expect(example?.example?.[0]).not.toContain('si rige');
    expect(example?.after?.[0]).toContain(
      'El Congreso convalidó el decreto (BOE del 13 de noviembre de 2026)',
    );
    expect(example?.after?.[0]).toContain('disposición final 6.ª');
    expect(page('rise').faq.map((q) => q.anchor)).not.toContain('faq-pendiente');
  });

  it('keeps both accounts and the pending question while the decree awaits the vote', () => {
    const rise = pageBeforeVote('rise');
    const example = rise.sections?.find((s) => s.id === 'ejemplo');
    expect(example?.example).toHaveLength(2);
    expect(example?.after?.[0]).toContain('Mientras el decreto esté pendiente de convalidación');
    expect(rise.faq.map((q) => q.anchor)).toContain('faq-pendiente');
  });

  it('says which account applies once the decree is repealed', () => {
    const rise = rentalPage('rise', {
      norms: repealedDecree,
      checkedOn: '2026-11-18',
      irav: 2.47,
      example: example(),
    });
    const after = rise.sections?.find((s) => s.id === 'ejemplo')?.after?.[0];
    expect(after).toBe('El Congreso derogó el decreto: se aplica la segunda cuenta.');
    expect(rise.faq.map((q) => q.anchor)).not.toContain('faq-pendiente');
  });

  it('applies the IRAV when it is under the decree cap', () => {
    expect(text(page('rise', 1.5))).toContain('913,50 €');
  });

  it('dates the decree and links the pages it names', () => {
    const decree = page('decree');
    expect(text(decree)).toContain('8 de octubre de 2026');
    expect(text(decree)).not.toContain('en torno al');
    const links = decree.sections?.flatMap((s) => s.links ?? []).map((l) => l.path);
    expect(links).toContain(RENTAL_PAGES.rise.path);
    expect(links).toContain(RENTAL_PAGES.fees.path);
    // The pages of this build, not the hub's anchors.
    for (const id of ['deposit', 'charges', 'deposit_return'] as const)
      expect(links).toContain(RENTAL_PAGES[id].path);
    expect(links?.some((l) => l.includes('#'))).toBe(false);
  });

  it('opens the decree list with the 2 % cap and the IRAV, each point in its own words', () => {
    const list = page('decree').sections?.find((s) => s.id === 'que-cambia')?.list ?? [];
    expect(list[0]).toContain('2 %');
    expect(list[0]).toContain('31 de diciembre de 2027');
    expect(list[0]).toContain('IRAV');
    for (const item of list) expect(item).not.toMatch(/: (Además|Y |[A-ZÁÉÍÓÚ])/);
  });

  it('gives the decree status once, in the line that opens its list', () => {
    const open = (p: RentalPage) => p.sections?.find((s) => s.id === 'que-cambia');
    expect(open(page('decree'))?.paragraphs[0]).toContain('convalidado por el Congreso');
    expect(open(pageBeforeVote('decree'))?.paragraphs[0]).toContain(
      'pendiente de que el Congreso lo convalide',
    );
    for (const p of [page('decree'), pageBeforeVote('decree')])
      for (const item of open(p)?.list ?? []) expect(item).not.toContain('pendiente');
  });

  it('says when a decree-law takes effect and what its repeal means, while it awaits the vote', () => {
    const decree = pageBeforeVote('decree');
    expect(decree.lead).toContain('el día siguiente a publicarse');
    expect(decree.lead).not.toContain('al publicarse');
    const repeal = decree.faq.find((q) => q.anchor === 'faq-derogado');
    expect(repeal?.answer).toMatch(/^Queda derogado y deja de aplicarse/);
  });

  it('says the validated decree can no longer lapse, and names the BOE that published its validation', () => {
    const decree = page('decree');
    expect(decree.lead).toBe(
      'El Real Decreto-ley 29/2026 rige desde el 8 de octubre de 2026. El Congreso lo convalidó (BOE del 13 de noviembre de 2026), así que ya no puede decaer: solo otra norma puede cambiarlo.',
    );
    expect(decree.faq.map((q) => q.anchor)).not.toContain('faq-derogado');
    const still = decree.faq.find((q) => q.anchor === 'faq-puede-caer');
    expect(still?.question).toBe('¿Puede caer todavía?');
    expect(still?.answer).toBe(
      'No. El Congreso lo convalidó (BOE del 13 de noviembre de 2026); desde entonces solo otra norma puede cambiarlo.',
    );
    expect(text(decree)).not.toContain('pendiente');
    expect(decree.description).toContain('convalidado por el Congreso el 12 de noviembre');
  });

  it('lists only the earlier decrees of the 2 % cap among those that fell', () => {
    const answer = page('decree').faq.find((q) => q.anchor === 'faq-anteriores')?.answer ?? '';
    expect(answer).toContain('RDL 8/2026');
    expect(answer).toContain('RDL 26/2026');
    expect(answer).not.toContain('29/2026');
  });

  it('reads the other names of an agency fee the same way in the text and in the question', () => {
    const fees = page('fees');
    const answer = fees.faq.find((q) => q.anchor === 'faq-otro-nombre')?.answer ?? '';
    expect(fees.sections?.[0]?.after).toContain(answer);
    expect(answer).toContain('pagado de más');
    expect(text(fees)).toContain('convalidado por el Congreso, tampoco');
    expect(text(pageBeforeVote('fees'))).toContain(
      'pendiente de que el Congreso lo convalide, tampoco',
    );
  });

  it('works out one month plus VAT on a 900 € rent', () => {
    const fees = page('fees');
    expect(text(fees)).toContain('1.089,00 €');
    expect(text(fees)).toContain('estudio de solvencia');
  });
});

describe('the worked examples of the deposit and charges pages', () => {
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
