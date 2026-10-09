// Official bodies and norms whose exact name holds a word the site never uses in its own voice. Copy may
// name them only as written here; any other use of the word still fails the copy test.
export const OFFICIAL_NAMES = [
  'Servicio de Reclamaciones del Banco de España',
  'Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones',
  'Ley de 23 de julio de 1908 sobre nulidad de los contratos de préstamos usurarios',
] as const;

export type OfficialName = (typeof OFFICIAL_NAMES)[number];
