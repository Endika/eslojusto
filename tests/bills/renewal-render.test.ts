// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderRenewalResult } from '../../src/bills/renewal/render';
import { BILLS_NORMS } from '../../src/engine/bills/data/norms';
import { BILLS_TABLES } from '../../src/engine/bills/data/tables';
import type { NormTable } from '../../src/engine/bills/norms';
import { reviewRenewal, type RenewalReviewDeps } from '../../src/engine/bills/renewal-review';
import type { RenewalInput } from '../../src/engine/bills/renewal-types';
import { pageTranslator } from '../support/page-strings';
import { deps, naturgy, official, TODAY } from './renewal-support';

const tr = pageTranslator('bills');

// The words that would turn a figure into advice.
const ADVICE =
  /\b(cámbiate|cámbiese|te conviene|deberías|debes|cambia de|cambiar de|contrata|contratar|aprovecha|ahorra|elige)\b/i;

function shown(input: RenewalInput, own: RenewalReviewDeps = deps(), norms = BILLS_NORMS) {
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
const notice = (root: HTMLElement): string =>
  card(root, 'El preaviso').querySelector('p')?.textContent ?? '';

describe('the Naturgy letter', () => {
  const root = shown(naturgy());

  it('gives the recalculation, the rise, the split and the notice with their units', () => {
    expect(text(root)).toContain('1.071,15 €');
    expect(text(root)).toContain('909,16 €');
    expect(text(root)).toContain('+17,8 %');
    expect(text(root)).toContain('11,49 €/kW·año');
    expect(text(root)).toContain('18,37 €/kW·año');
    expect(text(root)).toContain('40 días');
    expect(text(root)).toContain('0,164508 €/kWh');
  });

  it('says the rise does not come from what is regulated', () => {
    expect(text(card(root, 'Qué parte de los precios es regulada'))).toContain(
      'La subida no viene de lo regulado',
    );
  });

  it('shows the PVPC range, both annual figures, the signed difference and the plain average', () => {
    const pvpc = text(card(root, 'Frente al PVPC'));
    expect(pvpc).toContain('del 03-11-2025 al 02-11-2026');
    expect(pvpc).toContain('600,39 €');
    expect(pvpc).toContain('Diferencia (carta menos PVPC): +470,76 €');
    expect(pvpc).toContain('media simple de todas las horas de ese rango');
    expect(pvpc).toContain('sin el perfil de consumo de REE');
    expect(pvpc).toContain('valor de 2016 sin actualizar');
  });

  it('writes a negative difference with its sign', () => {
    const cheap = shown(naturgy(), deps(official(300)));
    expect(text(card(cheap, 'Frente al PVPC'))).toMatch(/Diferencia \(carta menos PVPC\): -\d/);
  });

  it('cites the notice rule and the exit rule with their sources', () => {
    const rule = text(card(root, 'El preaviso'));
    expect(rule).toContain('Real Decreto 88/2026, art. 6.1.m');
    expect(card(root, 'El preaviso').querySelector('a')?.getAttribute('href')).toMatch(/^https:/);
    expect(text(card(root, 'Salir del contrato'))).toContain('art. 28.3');
  });

  it('leaves the taxes to the norms still open, each option with its figures and rates', () => {
    const taxes = text(card(root, 'Las cuentas de la carta'));
    expect(taxes).toContain('depende');
    expect(taxes).toContain(
      '1.184,16 € con impuestos, con 0,5 % de impuesto eléctrico y 10 % de IVA',
    );
    expect(taxes).toContain(
      '1.362,36 € con impuestos, con 5,11269632 % de impuesto eléctrico y 21 % de IVA',
    );
    expect(taxes).toContain(BILLS_NORMS.rdl25_2026_december.citation);
    expect(taxes).toContain(
      'La carta declara 1.362,36 € con impuestos, que coincide con la opción de',
    );
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

  it('says what is missing instead of a figure', () => {
    const none = shown(naturgy({ annualKwh: null }));
    expect(text(none.querySelector('[data-lead]') as HTMLElement)).toContain(
      'no da el consumo anual',
    );
    expect(text(card(none, 'Las cuentas de la carta'))).toContain('Sin el consumo anual');
    expect(text(card(none, 'Frente al PVPC'))).toContain('Sin el consumo anual');
    const periods = { p1: 0.2, p2: 0.15, p3: 0.1 };
    const byPeriod = shown(
      naturgy({
        current: { power: { p1: 0.11, p2: 0.03 }, energy: periods },
        next: { power: { p1: 0.12, p2: 0.05 }, energy: periods },
      }),
    );
    expect(text(card(byPeriod, 'Las cuentas de la carta'))).toContain('consumo de cada periodo');
    expect(text(card(byPeriod, 'Frente al PVPC'))).toContain('consumo de cada periodo');
    expect(text(card(byPeriod, 'Qué parte de los precios es regulada'))).not.toContain(
      'un solo precio',
    );
  });

  it('says there is no PVPC to compare with when its prices did not load', () => {
    expect(text(card(shown(naturgy(), deps(null)), 'Frente al PVPC'))).toContain(
      'No hay precios del PVPC',
    );
  });
});

describe('the notice', () => {
  it('reads «cumple» only when it meets', () => {
    expect(notice(shown(naturgy()))).toMatch(/\bcumple\b/);
    const others = [
      naturgy({ letterDate: '2026-11-20' }),
      naturgy({ letterDate: '2026-05-01' }),
      naturgy({ separateFromBill: false }),
      naturgy({ separateFromBill: null }),
    ];
    for (const input of others)
      expect(notice(shown(input)), notice(shown(input))).not.toMatch(/\bcumple\b/i);
  });

  it('gives both dates when it falls short', () => {
    expect(notice(shown(naturgy({ letterDate: '2026-11-20' })))).toBe(
      'La antelación no llega a un mes: 20 días entre la carta (20-11-2026) y la renovación (10-12-2026).',
    );
  });

  it('says a letter before 12-06-2026 is not checked, with the date', () => {
    const before = notice(shown(naturgy({ letterDate: '2026-05-01' })));
    expect(before).toContain('12-06-2026');
    expect(before).toContain('no comprueba');
  });

  it('says the date meets the month but not whether it came apart from the bill', () => {
    const unknown = notice(shown(naturgy({ separateFromBill: null })));
    expect(unknown).toContain('La fecha alcanza el mes de antelación: 40 días');
    expect(unknown).toContain('no lo sabemos');
  });

  it('says the letter came with the bill', () => {
    expect(notice(shown(naturgy({ separateFromBill: false })))).toContain('junto a la factura');
  });
});

describe('leaving the contract', () => {
  const exit = (change: Partial<RenewalInput>) =>
    text(card(shown(naturgy(change)), 'Salir del contrato'));

  it('is free at a renewal', () => {
    expect(exit({})).toContain('rescindir no lleva penalización');
  });
  it('may cost up to 5 % of the energy left on a fixed price before the first renewal', () => {
    expect(exit({ fixedPrice: true, firstRenewal: true })).toContain('5 % de la energía pendiente');
  });
  it('does not say when the answers are unknown', () => {
    expect(exit({ fixedPrice: null })).toContain('No sabemos si el precio es fijo');
  });
});

describe('the regulated part', () => {
  it('says when tolls and charges change between the two dates', () => {
    const row = (from: string, until: string, p1: number) => ({
      from,
      until,
      value: { power: { p1, p2: 0.5 }, energy: { p1: 0.01, p2: 0.01, p3: 0.01 } },
      norm: 'law38_1992' as const,
      url: 'https://example.test',
    });
    const own: RenewalReviewDeps = {
      ...deps(),
      tables: {
        ...BILLS_TABLES,
        tolls: [row('2026-01-01', '2026-11-30', 1), row('2026-12-01', '2026-12-31', 2)],
        charges: [row('2026-01-01', '2026-12-31', 0)],
      },
    };
    expect(text(card(shown(naturgy(), own), 'Qué parte de los precios es regulada'))).toContain(
      'parte de la subida viene de lo regulado',
    );
  });

  it('does not separate it when the renewal day has no tables', () => {
    const split = card(
      shown(naturgy({ renewalDate: '2027-01-15' })),
      'Qué parte de los precios es regulada',
    );
    expect(text(split)).toContain('No tenemos los peajes y cargos del 15-01-2027');
  });

  it('does not separate it while the norm that sets it is open, and names the norm', () => {
    const december = BILLS_NORMS.rdl25_2026_december;
    const [held] = BILLS_TABLES.tolls;
    if (held === undefined || december.condition === undefined) throw new Error('fixture expected');
    const open: NormTable = {
      ...BILLS_NORMS,
      rdl25_2026_december: {
        ...december,
        status: 'conditional',
        condition: { ...december.condition, met: null },
      },
    };
    const own: RenewalReviewDeps = {
      ...deps(),
      norms: open,
      tables: {
        ...BILLS_TABLES,
        tolls: [
          {
            ...held,
            from: '2026-12-01',
            until: '2026-12-31',
            norm: 'rdl25_2026_december' as const,
          },
        ],
      },
    };
    const split = text(card(shown(naturgy(), own, open), 'Qué parte de los precios es regulada'));
    expect(split).toContain(december.citation);
    expect(split).toContain('no se separan');
  });
});

describe('the taxes of a settled norm', () => {
  it('give one figure, its rates and how the letter’s own compares', () => {
    const root = shown(naturgy({ letterDate: '2026-05-30', renewalDate: '2026-07-10' }));
    const cost = text(card(root, 'Las cuentas de la carta'));
    expect(cost).toMatch(/Con impuestos del 10-07-2026 \(.* de impuesto eléctrico y .* de IVA\): /);
    expect(cost).not.toContain('depende');
    expect(cost).toContain('La carta declara 1.362,36 € con impuestos');
  });
});

describe('every state', () => {
  const states: [string, RenewalInput, RenewalReviewDeps?][] = [
    ['Naturgy', naturgy()],
    ['short notice', naturgy({ letterDate: '2026-11-20' })],
    ['before the rule', naturgy({ letterDate: '2026-05-01' })],
    ['with the bill', naturgy({ separateFromBill: false })],
    ['unknown separation', naturgy({ separateFromBill: null })],
    ['fixed, first renewal', naturgy({ fixedPrice: true, firstRenewal: true })],
    ['unknown contract', naturgy({ fixedPrice: null })],
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

describe('what decides each tax figure', () => {
  const lines = (root: HTMLElement) =>
    [...card(root, 'Las cuentas de la carta').querySelectorAll('li, .sheet > p, .sheet > div > p')]
      .map((e) => e.textContent)
      .slice(4);

  it('says plainly what has to happen, and when it is known', () => {
    expect(lines(shown(naturgy()))).toEqual([
      'Los impuestos del 10-12-2026 dependen de lo que se decida sobre: Real Decreto-ley 25/2026, arts. 19 y 21 (rebaja de diciembre de 2026); Real Decreto-ley 25/2026, de 29 de septiembre. No elegimos un resultado: estos son los posibles.',
      '1.184,16 € con impuestos, con 0,5 % de impuesto eléctrico y 10 % de IVA, en estos casos:',
      'si se cumple la condición del Real Decreto-ley 25/2026, arts. 19 y 21 (rebaja de diciembre de 2026) (que el IPC de la electricidad de octubre de 2026 suba más del 15 % interanual; se sabrá hacia el 13-11-2026) y el Congreso convalida el Real Decreto-ley 25/2026, de 29 de septiembre',
      '1.362,36 € con impuestos, con 5,11269632 % de impuesto eléctrico y 21 % de IVA, en los demás casos.',
      'La carta declara 1.362,36 € con impuestos, que coincide con la opción de 5,11269632 % de impuesto eléctrico y 21 % de IVA.',
    ]);
  });

  it('lists every option when some outcome has no rate, so «los demás casos» claims nothing', () => {
    const [vat] = BILLS_TABLES.vat;
    if (vat === undefined) throw new Error('fixture expected');
    const own: RenewalReviewDeps = {
      ...deps(),
      tables: {
        ...BILLS_TABLES,
        vat: [{ ...vat, from: '2026-12-01', until: '2026-12-31', norm: 'rdl25_2026_december' }],
      },
    };
    const t = text(card(shown(naturgy(), own), 'Las cuentas de la carta'));
    const r = reviewRenewal(naturgy(), TODAY, own);
    expect(
      r.ok && r.review.taxes?.kind === 'conditional' && r.review.taxes.unknown.length > 0,
    ).toBe(true);
    expect(t).not.toContain('en los demás casos');
  });

  it('cites each source once', () => {
    const rule = text(card(shown(naturgy()), 'El preaviso'));
    expect(rule).toContain('Real Decreto 88/2026, art. 6.1.m · ');
    expect(rule).not.toContain('por el que se aprueba');
  });
});

describe('the cap on a penalty', () => {
  it('comes from the review, not the copy', () => {
    expect(
      text(card(shown(naturgy({ fixedPrice: true, firstRenewal: true })), 'Salir del contrato')),
    ).toContain('al 5 % de la energía pendiente');
  });
});
