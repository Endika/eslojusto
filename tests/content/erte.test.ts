import { describe, expect, it } from 'vitest';
import {
  ertePositiveView,
  erteUnknownView,
  ERTE_FAQ,
  ERTE_GUIDE,
  ERTE_PAGE,
  ERTE_QUESTIONS,
} from '../../src/content/erte';
import { estimateErte, type ErteInput } from '../../src/engine/erte';
import { FORBIDDEN } from '../support/forbidden';
import { existsSync } from 'node:fs';
import { LANGS, type Lang } from '../../src/i18n/languages';

const view = (input: ErteInput) => ertePositiveView(input, estimateErte(input));
const text = (input: ErteInput) =>
  view(input)
    .blocks.map((b) => `${b.title} ${b.text} ${b.source}`)
    .join(' ')
    .replace(/\u00a0/g, ' ');
const base: ErteInput = {
  regime: 'etop',
  measure: { kind: 'suspension' },
  base: 1500,
  children: 0,
};

describe('ERTE result copy', () => {
  it('ETOP shows both stretches, the consumption and the 360 days', () => {
    const t = text(base);
    expect(t).toContain(
      '1.050 € al mes los primeros 180 días de prestación y unos 900 € desde el día 181',
    );
    expect(t).toContain('Sí. Cada día de ERTE');
    expect(t).toContain(
      '360 días cotizados en los últimos 6 años que no hayas usado para otro paro',
    );
    expect(t).toContain('Arts. 266.b y 269 LGSS');
    expect(t).toContain('Art. 269 LGSS');
    expect(t).not.toContain('inscrito');
  });
  it('force majeure shows 70 % throughout, no consumption and no minimum', () => {
    const t = text({ ...base, regime: 'force_majeure' });
    expect(t).toContain('Unos 1.050 € al mes.');
    expect(t).toContain(
      'Cobrarlo no gasta las cotizaciones que ya tenías: «el acceso a esta prestación no implicará el consumo de las cotizaciones previamente efectuadas a ningún efecto».',
    );
    expect(t).toContain('DA 46.ª.b LGSS');
    expect(t).toContain('No hace falta un período mínimo de cotización');
    expect(t).toContain('DA 46.ª LGSS');
  });
  it('shows the limits of the children answered, and the full span only without an answer', () => {
    expect(text({ ...base, children: 0 })).toContain('entre 560 € y 1.225 €');
    expect(text({ ...base, children: 1 })).toContain('entre 749 € y 1.400 €');
    expect(text({ ...base, children: 2 })).toContain('entre 749 € y 1.575 €');
    expect(text({ ...base, children: null })).toContain('entre 560 € y 1.575 €');
  });
  it('writes the percentage with a non-breaking space', () => {
    const t = view({ ...base, measure: { kind: 'reduction', percent: 40 } })
      .blocks.map((b) => b.text)
      .join(' ');
    expect(t).toContain('un 40\u00a0%');
    expect(t).not.toMatch(/\d %/);
  });
  it('RED shows the cap, no consumption, no minimum period and the registration notice', () => {
    const t = text({ ...base, regime: 'red', base: 3000 });
    expect(t).toContain('Unos 1.575 € al mes.');
    expect(t).toContain('tope de 1.575 € al mes');
    expect(t).toContain('inscrito como demandante de empleo');
    expect(t).toContain('La solicitud la presenta la empresa en tu nombre, en el plazo de un mes');
    expect(t).toContain('DA 41.ª.2 LGSS');
    expect(t).toContain('su propia prestación');
    expect(t).not.toContain('262');
    expect(t).toContain('No hace falta un período mínimo de cotización');
    expect(t).toContain('DA 41.ª.1 LGSS');
    expect(t).toContain('El tiempo que cobres en el mecanismo RED no se considera consumido');
    expect(t).not.toContain('360');
  });
  it('a reduction explains the proportion and the hours', () => {
    const t = text({ ...base, measure: { kind: 'reduction', percent: 40 } });
    expect(t).toContain('proporcional a esa reducción (art. 270.5 LGSS)');
    expect(t).toContain('por horas');
    expect(t).toContain('Art. 269.5 LGSS');
    expect(t).toContain('desempleo parcial');
  });
  it('a base under the full-time minimum gives no figure: the limits fall with the hours', () => {
    const t = text({ ...base, base: 700 });
    expect(t).toContain('bajan en proporción a tus horas (art. 270.3 LGSS)');
    expect(t).not.toMatch(/unos \d|entre \d/i);
    expect(text({ ...base, regime: 'red', base: 700 })).toContain('Unos 490 € al mes.');
  });
  it('the same figure in both stretches is written once', () => {
    const t = text({ ...base, base: 3000 });
    expect(t).toContain('Unos 1.225 € al mes, antes y después del día 181.');
  });
  it('a RED reduction takes the proportion as a criterion of the review', () => {
    const t = text({ ...base, regime: 'red', measure: { kind: 'reduction', percent: 50 } });
    expect(t).toContain('es un criterio de la revisión');
    expect(text({ ...base, measure: { kind: 'reduction', percent: 50 } })).not.toContain(
      'criterio de la revisión',
    );
  });
  it('a reduction in full days is total unemployment', () => {
    const t = text({ ...base, measure: { kind: 'reduction', percent: 40 } });
    expect(t).toContain(
      'Si la reducción se aplica en días completos, esos días son desempleo total.',
    );
  });
  it('an unknown type explains three regimes and gives no single figure', () => {
    const v = erteUnknownView();
    expect(v.blocks).toHaveLength(3);
    const t = v.blocks.map((b) => b.text).join(' ');
    expect(t).not.toMatch(/\bunos\b|\bentre\b/);
    expect(v.blocks[2]?.text).toContain('no hace falta un período mínimo de cotización');
    expect(v.blocks.map((b) => b.source)).toEqual([
      'Arts. 266.b, 269 y 270 LGSS',
      'DA 46.ª LGSS',
      'DA 41.ª LGSS',
    ]);
  });
  it('every block cites its article', () => {
    for (const b of [...view(base).blocks, ...erteUnknownView().blocks])
      expect(b.source).toMatch(/LGSS/);
  });
});

describe('ERTE copy gives no advice', () => {
  it('uses none of the forbidden words', () => {
    const all = JSON.stringify([
      ERTE_PAGE,
      ERTE_QUESTIONS,
      ERTE_GUIDE,
      ERTE_FAQ,
      view(base),
      erteUnknownView(),
      view({ ...base, regime: 'red' }),
    ]).toLowerCase();
    for (const forbidden of FORBIDDEN) expect(all).not.toMatch(forbidden);
  });
});

describe('the ERTE page in other languages', () => {
  // A published language can't lean on the Spanish copy.
  it('every published language has its own copy', () => {
    const published = (Object.keys(LANGS) as Lang[]).filter((i) => LANGS[i].published);
    for (const lang of published)
      expect(existsSync(`src/content/erte/${lang}.ts`), lang).toBe(true);
  });
});
