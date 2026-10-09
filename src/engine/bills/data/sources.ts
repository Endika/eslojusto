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
};
