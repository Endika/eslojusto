import { describe, expect, it } from 'vitest';
import { capsCopy, REFERENCE_INDEX_URL } from '../../src/content/rent-caps';
import { example } from '../../src/content/rent-indices';
import { NORMS } from '../../src/engine/rental/data/norms';
import type { NormTable } from '../../src/engine/rental/norms';

const render = (norms: NormTable) =>
  capsCopy('es', norms, { checkedOn: '2026-10-07', iravRate: 2.47, example: example() });

const withDecree = (patch: Partial<NormTable['rdl29_2026']>): NormTable => ({
  ...NORMS,
  rdl29_2026: { ...NORMS.rdl29_2026, ...patch },
});

const validated = withDecree({
  status: 'in_force',
  statusSince: '2026-11-06',
  statusUrl: 'https://www.boe.es/',
});
const repealed = withDecree({
  status: 'repealed',
  inForceUntil: '2026-11-05',
  endUncertainUntil: '2026-11-06',
  statusSince: '2026-11-06',
  statusUrl: 'https://www.boe.es/',
});

const ids = (norms: NormTable) => render(norms).rows.map((r) => r.id);

describe('the cap copy while RDL 29/2026 awaits validation', () => {
  const copy = render(NORMS);

  it('lists its cap as current, with the reference-index condition and its link', () => {
    expect(ids(NORMS)).toEqual(['ipc', 'igc', 'three', 'irav', 'two']);
    const two = copy.rows.at(-1);
    expect(two?.when).toBe('Desde el 08-10-2026');
    expect(two?.rule).toContain('zona de mercado tensionado');
    expect(two?.sources.map((s) => s.url)).toContain(REFERENCE_INDEX_URL);
    expect(copy.rows.find((r) => r.id === 'irav')?.when).toBe('Del 01-01-2025 al 07-10-2026');
  });

  it('says it is pending, with the day it was checked', () => {
    expect(copy.status).toMatch(/^Estado a 7 de octubre de 2026: .*pendiente de convalidación/);
    expect(copy.now).toContain('no cabe ninguna subida');
    expect(copy.exampleLater).toContain('816,00\u00a0€');
  });

  it('keeps the CPI cap and the large landlord in 2022–2024', () => {
    for (const id of ['igc', 'three']) {
      const rule = copy.rows.find((r) => r.id === id)?.rule ?? '';
      expect(rule).toContain('o el IPC si es más bajo');
      expect(rule).toContain('gran tenedor');
    }
  });

  it('dates the repealed decrees from the table, with their doubtful last day', () => {
    expect(copy.repealed).toContain(
      'el RDL 8/2026, que rigió del 22-03-2026 hasta el 29 o el 30-04-2026',
    );
    expect(copy.repealed).toContain(
      'el RDL 26/2026, que rigió el 01-10-2026 (o hasta el 02-10-2026)',
    );
    expect(copy.repealed).not.toContain('RDL 29/2026');
  });

  it('takes the IGC clamp citation from the rules', () => {
    expect(copy.igcClamp.url).toBe('https://www.boe.es/buscar/act.php?id=BOE-A-2015-3443#an');
  });
});

describe('the cap copy once RDL 29/2026 is validated', () => {
  const copy = render(validated);

  it('keeps its cap and says it was validated', () => {
    expect(ids(validated)).toContain('two');
    expect(copy.status).toContain('el Congreso convalidó el RDL 29/2026');
    expect(copy.status).toContain('06-11-2026');
    expect(copy.faqIravOrIpc).toContain('convalidado por el Congreso');
    expect(copy.now).not.toBeNull();
  });
});

describe('the cap copy once RDL 29/2026 is repealed', () => {
  const copy = render(repealed);

  it('no longer lists its cap as current', () => {
    expect(ids(repealed)).not.toContain('two');
    expect(copy.rows.find((r) => r.id === 'irav')?.when).toBe('Desde el 01-01-2025');
    expect(copy.now).toBeNull();
    expect(copy.exampleLater).toBeNull();
  });

  it('lists it with the other repealed decrees and its doubtful end', () => {
    expect(copy.status).toContain('el Congreso derogó el RDL 29/2026');
    expect(copy.repealed).toContain(
      'el RDL 29/2026, que rigió del 08-10-2026 hasta el 05 o el 06-11-2026',
    );
    expect(copy.faqIravOrIpc).toContain('pero el Congreso lo derogó');
    expect(copy.faqNoClause).toContain('derogado por el Congreso');
  });
});
