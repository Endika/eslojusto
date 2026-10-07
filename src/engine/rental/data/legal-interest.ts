import type { LegalInterestYear } from '../legal-interest';

// Banco de España table, checked on 08-10-2026. Since 2024 the 3,25 % of the 2023 budget law
// (Ley 31/2022, DA 42.ª) still applies because that budget stays extended (art. 134.4 CE).
const BDE_TABLE =
  'https://clientebancario.bde.es/pcb/es/menu-horizontal/podemosayudarte/tiposinteres/guia_textual/tiposinteresreferenciaotrostiposfrecuentes/Tabla_tipos_de_interes_legal.html';

export const LEGAL_INTEREST: readonly LegalInterestYear[] = [
  { year: 2016, rate: 3, url: BDE_TABLE },
  { year: 2017, rate: 3, url: BDE_TABLE },
  { year: 2018, rate: 3, url: BDE_TABLE },
  { year: 2019, rate: 3, url: BDE_TABLE },
  { year: 2020, rate: 3, url: BDE_TABLE },
  { year: 2021, rate: 3, url: BDE_TABLE },
  { year: 2022, rate: 3, url: BDE_TABLE },
  { year: 2023, rate: 3.25, url: BDE_TABLE },
  { year: 2024, rate: 3.25, url: BDE_TABLE },
  { year: 2025, rate: 3.25, url: BDE_TABLE },
  { year: 2026, rate: 3.25, url: BDE_TABLE },
];
