import type { SourceTable } from '../norms';

// Official figures the tables rest on besides their norms.
export const BILLS_SOURCES: SourceTable = {
  // Decides the conditional reductions of 2026: its publication calendar gives the day each
  // figure is out. No figure is loaded from it: each month's `condition.met` is set by hand in
  // data/norms.ts.
  ine_cpi_electricity: {
    id: 'ine_cpi_electricity',
    basis: 'official_data',
    citation: 'INE, Índice de Precios de Consumo, subclase 04.5.1.0 (electricidad)',
    article: 'tasa de variación anual',
    url: 'https://servicios.ine.es/wstempus/js/ES/PUBLICACIONFECHA_PUBLICACION/8',
    inForceSince: '2026-05-14',
    lastVerified: '2026-10-09',
    verified: false,
    quotes: [],
  },
  // A rise under a clause tied to an official consumer price index is not a change of conditions
  // that lets the subscriber leave without penalty (Directive 2002/22/EC, art. 20.2). Read in its
  // summaries only, and on a directive since replaced: shown as the court's criterion, never as a
  // figure.
  tjue_c326_14: {
    id: 'tjue_c326_14',
    basis: 'case_law',
    citation: 'Sentencia del Tribunal de Justicia de la Unión Europea de 26 de noviembre de 2015',
    article: 'asunto C-326/14, Verein für Konsumenteninformation',
    url: 'https://eur-lex.europa.eu/legal-content/ES/TXT/?uri=CELEX:62014CJ0326',
    inForceSince: '2015-11-26',
    court: 'Tribunal de Justicia de la Unión Europea',
    number: 'C-326/14',
    decidedOn: '2015-11-26',
    ecli: null,
    lastVerified: '2026-10-10',
    verified: false,
    quotes: [],
  },
};
