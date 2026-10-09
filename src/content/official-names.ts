// Official bodies whose exact name holds a word the site never uses in its own voice. Copy may
// name them only as written here; any other use of the word still fails the copy test.
export const OFFICIAL_NAMES = [
  'Servicio de Reclamaciones del Banco de España',
  'Servicio de Reclamaciones de la Dirección General de Seguros y Fondos de Pensiones',
] as const;

export type OfficialName = (typeof OFFICIAL_NAMES)[number];
