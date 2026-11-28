// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderRenewalResult } from '../../src/bills/renewal/render';
import { reviewRenewal, type RenewalReviewDeps } from '../../src/engine/bills/renewal-review';
import type { RenewalInput } from '../../src/engine/bills/renewal-types';
import { pageTranslator } from '../support/page-strings';
import { NORMS_BEFORE_FIGURE } from '../engine/bills/norms-before-figure';
import { deps, flatPvpc, naturgy, official, TODAY } from './renewal-support';

const tr = pageTranslator('bills');

// The words that would turn a figure into advice.
const ADVICE =
  /\b(cámbiate|cámbiese|te conviene|deberías|debes|cambia de|cambiar de|contrata|contratar|aprovecha|ahorra|elige)\b/i;

function shown(input: RenewalInput, own: RenewalReviewDeps = deps(), norms = NORMS_BEFORE_FIGURE) {
  const root = document.createElement('section');
  root.innerHTML = '<p data-lead></p><div data-renewal></div>';
  const r = reviewRenewal(input, TODAY, own);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  renderRenewalResult(root, r.review, norms, tr);
  return root;
}

const card = (root: HTMLElement, title: string): HTMLElement => {
  const found = [...root.querySelectorAll<HTMLElement>('.item')].find(
    (c) => c.querySelector('h3')?.textContent === title,
  );
  if (!found) throw new Error(`No card «${title}»`);
  return found;
};
const text = (root: HTMLElement): string => root.textContent ?? '';

describe('the Naturgy letter', () => {
  const root = shown(naturgy());

  it('shows the PVPC range, both annual figures, the signed difference and the plain average', () => {
    const pvpc = text(card(root, 'Frente al PVPC'));
    expect(pvpc).toContain('del 03-11-2025 al 02-11-2026');
    expect(pvpc).toContain('600,39 €');
    expect(pvpc).toContain('Diferencia (carta menos PVPC): +470,76 €');
    expect(pvpc).toContain('media simple de todas las horas de ese rango');
    expect(pvpc).toContain('sin el perfil de consumo de REE');
    expect(pvpc).toContain('valor de 2016 sin actualizar');
  });
});

describe('the recalculation', () => {
  it('names both figures when the declared cost is more than 1 € away', () => {
    const cost = text(
      card(
        shown(naturgy({ declared: { withoutTax: 1100, withTax: null } })),
        'Las cuentas de la carta',
      ),
    );
    expect(cost).toContain(
      'La carta declara 1.100,00 € sin impuestos y el recálculo da 1.071,15 €',
    );
  });

  it('says there is no PVPC to compare with when its prices did not load', () => {
    expect(text(card(shown(naturgy(), deps(null)), 'Frente al PVPC'))).toContain(
      'No hay precios del PVPC',
    );
  });

  it('names the missing tables of a 2027 renewal, not the PVPC prices', () => {
    const pvpc = text(card(shown(naturgy({ renewalDate: '2027-01-15' })), 'Frente al PVPC'));
    expect(pvpc).toBe(
      'Frente al PVPCNo tenemos los peajes, los cargos o el margen del PVPC del 15-01-2027, así que no se compara con el PVPC.',
    );
  });

  it('says how many months the PVPC covers when it is less than a year', () => {
    const tenMonths = deps({ ...official(), pvpc: flatPvpc('2026-10-31', 100, 304) });
    const pvpc = text(card(shown(naturgy(), tenMonths), 'Frente al PVPC'));
    expect(pvpc).toContain('Solo hay 10 meses publicados del PVPC, del 01-01-2026 al 31-10-2026');
    expect(text(card(shown(naturgy()), 'Frente al PVPC'))).not.toContain('Solo hay');
  });
});

describe('every state', () => {
  const states: [string, RenewalInput, RenewalReviewDeps?][] = [
    ['Naturgy', naturgy()],
    ['short notice', naturgy({ letterDate: '2026-11-20' })],
    ['before the rule', naturgy({ letterDate: '2026-05-01' })],
    ['with the bill', naturgy({ separateFromBill: false })],
    ['unknown separation', naturgy({ separateFromBill: null })],
    ['no price change', naturgy({ next: naturgy().current })],
    ['short with the bill', naturgy({ letterDate: '2026-11-20', separateFromBill: false })],
    ['mismatch', naturgy({ declared: { withoutTax: 1100, withTax: null } })],
    ['no consumption', naturgy({ annualKwh: null })],
    ['PVPC below', naturgy(), deps(official(300))],
    ['no PVPC', naturgy(), deps(null)],
    ['no tables', naturgy({ renewalDate: '2027-01-15' })],
    ['settled taxes', naturgy({ letterDate: '2026-05-30', renewalDate: '2026-07-10' })],
  ];
  it.each(states)('%s never advises', (_name, input, own) => {
    expect(text(shown(input, own))).not.toMatch(ADVICE);
  });
});
