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
    expect(t).toContain('1.050 € al mes los primeros 180 días y unos 900 € desde el día 181');
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
      'No. Cobrar el paro por un ERTE de fuerza mayor no gasta las cotizaciones que ya tenías',
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
    expect(t).toContain('tope de 1.575,00 €');
    expect(t).toContain('inscrito como demandante de empleo');
    expect(t).toContain('DA 41.ª.2.c LGSS');
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
