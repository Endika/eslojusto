import type { LegalInterestTable } from '../interest';

// Banco de España table of the interés legal del dinero, which gives each year's budget law (or
// its extension), checked on 08-10-2026. Since 2024 the 3,25 % of the 2023 budget law (Ley 31/2022,
// DA 42.ª) still applies because that budget stays extended (art. 134.4 CE). 2009 changed on
// 1 April. A new year extends the last row when its rate is the same, or adds one when it is not.
const BDE_TABLE =
  'https://clientebancario.bde.es/pcb/es/menu-horizontal/podemosayudarte/tiposinteres/guia_textual/tiposinteresreferenciaotrostiposfrecuentes/Tabla_tipos_de_interes_legal.html';

const period = (from: string, until: string, rate: number) => ({
  from,
  until,
  rate,
  url: BDE_TABLE,
});

export const LEGAL_INTEREST: LegalInterestTable = [
  period('1995-01-01', '1996-12-31', 9),
  period('1997-01-01', '1997-12-31', 7.5),
  period('1998-01-01', '1998-12-31', 5.5),
  period('1999-01-01', '2000-12-31', 4.25),
  period('2001-01-01', '2001-12-31', 5.5),
  period('2002-01-01', '2003-12-31', 4.25),
  period('2004-01-01', '2004-12-31', 3.75),
  period('2005-01-01', '2006-12-31', 4),
  period('2007-01-01', '2007-12-31', 5),
  period('2008-01-01', '2009-03-31', 5.5),
  period('2009-04-01', '2014-12-31', 4),
  period('2015-01-01', '2015-12-31', 3.5),
  period('2016-01-01', '2022-12-31', 3),
  period('2023-01-01', '2026-12-31', 3.25),
];
