import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import type { RentalInput } from '../../src/engine/rental/types';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { sans } from '../../src/documents/fonts/sans';
import { serif } from '../../src/documents/fonts/serif';
import { NO_DETAILS } from '../../src/documents/letter';
import { depositLetter, rentLetter } from '../../src/rental/letters';
import { rentalReport } from '../../src/rental/report';
import { FORBIDDEN } from '../support/forbidden';
import { repealedWindow, review, riseAboveIrav, TODAY, tr } from './fixtures';

const report = (input: RentalInput): DocumentModel =>
  rentalReport({ review: review(input), input, detail: 'unlocked' }, tr, TODAY);

const text = (blocks: readonly Block[]) =>
  blocks
    .map((b) =>
      'text' in b ? b.text : 'label' in b ? `${b.label} ${'value' in b ? b.value : ''}` : '',
    )
    .join('\n');

// A 2025 rise above the IRAV, an agency fee and a deposit with 150 € still out.
const full: RentalInput = {
  ...riseAboveIrav,
  fees: [{ kind: 'agency_fee', amount: 500, deductedLater: false, requestedInWriting: null }],
  moveOut: {
    keysReturnedOn: f('2026-06-30'),
    returns: [{ on: f('2026-08-14'), amount: 850 }],
    deductions: [],
  },
};

describe('the rental report', () => {
  const model = report(full);
  const all = text(model.blocks);

  it('gives the data the person confirmed', () => {
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Fecha del contrato',
      value: '15-03-2024',
    });
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Actualización de la renta',
      value: 'El IPC',
    });
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Llaves devueltas el',
      value: '30-06-2026',
    });
    expect(all).toContain('Comunidad de Madrid');
  });

  it('gives each item with its exact figures and its calculation', () => {
    expect(all).toContain('Subida del 20-03-2025');
    expect(all).toMatch(/Pagas de más: 110,40\s€/);
    expect(all).toMatch(/Renta máxima 1\.020,80\s€/);
    expect(all).toMatch(/De más cada mes 9,20\s€/);
    expect(all).toMatch(/Pagas de más: 500,00\s€/);
    expect(all).toMatch(/Te deben 150,00\s€/);
    expect(all).toMatch(/Pagas o has pagado de más al menos 610,40\s€\./);
  });

  it('gives both readings of a doubt, and what the total takes of it', () => {
    expect(all).toMatch(
      /Depende de si el año de intereses cuenta 365 días o 360: te deben 1,98\s€ o te deben 2,01\s€/,
    );
    expect(all).toMatch(/Al total se suma solo la cuenta más baja: 1,98\s€\./);
    expect(all).toContain('Una cuenta');
    expect(all).toContain('La otra cuenta');
  });

  it('lists each index with its month and publication day', () => {
    const at = model.blocks.findIndex(
      (b) => b.type === 'heading' && b.text === 'Índices usados, con su mes y su publicación',
    );
    expect(model.blocks.slice(at + 1, at + 3)).toEqual([
      { type: 'bullet', text: 'IPC de febrero de 2025: 3 %, publicado el 14-03-2025' },
      { type: 'bullet', text: 'IRAV de febrero de 2025: 2,08 %, publicado el 14-03-2025' },
    ]);
  });

  it('gives each norm once with how it stands, linked', () => {
    const at = model.blocks.findIndex(
      (b) => b.type === 'heading' && b.text === 'Las normas y su estado',
    );
    const norms = model.blocks.slice(at + 1).filter((b) => b.type === 'source');
    const deposit = norms.find(
      (b) =>
        b.type === 'source' &&
        b.text ===
          'LAU, art. 36.4 (Ley 29/1994, de 24 de noviembre, de Arrendamientos Urbanos) · en vigor',
    );
    expect(deposit).toMatchObject({ url: expect.stringMatching(/^https:\/\/www\.boe\.es\//) });
    expect(all).toMatch(/Real Decreto-ley 28\/2026.* · pendiente de convalidación/);
  });

  it('every item cites its sources with the days they had effect', () => {
    expect(model.blocks).toContainEqual(
      expect.objectContaining({
        type: 'source',
        text: 'LAU, art. 18.1 (Real Decreto-ley 7/2019, de 1 de marzo) · con efectos desde el 06-03-2019 · en vigor',
      }),
    );
  });

  it('gives the information blocks, what is not checked and the day it was made', () => {
    expect(all).toContain('Para que lo tengas en cuenta');
    expect(all).toContain('Depósito de la fianza');
    expect(all).toContain('Lo que esta revisión no comprueba');
    expect(all).toContain('Si los desperfectos justifican un descuento de la fianza.');
    expect(all).toContain('eslojusto.es · 8 de octubre de 2026');
    expect(model.footer).toContain('8 de octubre de 2026');
  });

  it('shows a repealed window with both readings, out of the total', () => {
    const repealed = text(report(repealedWindow).blocks);
    expect(repealed).toContain('Depende de cómo se lea una norma que ya está derogada');
    expect(repealed).toContain('No se suma al total mientras esa duda siga abierta.');
    expect(repealed).toMatch(/derogada el 30-04-2026/);
  });

  it('gives no advice', () => {
    for (const forbidden of FORBIDDEN) expect(all.toLowerCase()).not.toMatch(forbidden);
  });
});

describe('the rental documents', () => {
  it('use only characters both fonts can draw', () => {
    // The writer turns these spaces into plain ones.
    const substituted = new Set(['\u00a0', '\u202f', '\u2009']);
    const missing = new Set<string>();
    for (const input of [full, repealedWindow]) {
      const r = { review: review(input), input, detail: 'unlocked' as const };
      for (const model of [
        rentalReport(r, tr, TODAY),
        depositLetter(r, TODAY, NO_DETAILS, tr),
        rentLetter(r, NO_DETAILS, tr),
      ])
        for (const c of text(model.blocks)) {
          const code = String(c.codePointAt(0));
          if (c !== '\n' && !substituted.has(c) && !(code in sans.glyphs && code in serif.glyphs))
            missing.add(c);
        }
    }
    expect([...missing]).toEqual([]);
  });
});
