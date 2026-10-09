import type { Norm } from '../../../src/engine/law/norms';
import type { RuleBase } from '../../../src/engine/law/rules';
import type { CaseLawSource, StatuteSource } from '../../../src/engine/law/sources';

const BOE = 'https://www.boe.es/buscar/act.php?id=BOE-A-2030-1';

export const norm = (change: Partial<Norm<'x'>> = {}): Norm<'x'> => ({
  id: 'x',
  citation: 'Ley de prueba 1/2030',
  url: BOE,
  inForceSince: '2030-03-01',
  inForceUntil: null,
  status: 'in_force',
  statusSince: null,
  statusUrl: null,
  ...change,
});

export const statute = (change: Partial<StatuteSource> = {}): StatuteSource => ({
  id: 'statute',
  basis: 'statute',
  citation: 'Ley de prueba 1/2030, art. 3',
  article: 'art. 3',
  url: `${BOE}#a3`,
  inForceSince: '2030-03-01',
  lastVerified: '2030-06-01',
  verified: true,
  quotes: [],
  ...change,
});

export const caseLaw = (change: Partial<CaseLawSource> = {}): CaseLawSource => ({
  id: 'ruling',
  basis: 'case_law',
  citation: 'STS 1/2030, de 15 de febrero',
  article: 'fundamento de derecho tercero',
  url: 'https://www.poderjudicial.es/search/indexAN.jsp',
  inForceSince: '2030-02-15',
  court: 'Tribunal Supremo',
  number: '1/2030',
  decidedOn: '2030-02-15',
  ecli: null,
  lastVerified: '2030-06-01',
  verified: true,
  quotes: [],
  ...change,
});

export const amountRule = (change: Partial<RuleBase> = {}): RuleBase => ({
  id: 'cap',
  norm: 'x',
  output: 'amount',
  sources: ['statute'],
  ...change,
});
