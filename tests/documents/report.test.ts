import { describe, expect, it } from 'vitest';
import { letterKind } from '../../src/documents/case';
import type { Block } from '../../src/documents/ports';
import { letterModel, reportModel } from '../../src/documents/report';
import { completed, today, tr, unfairDismissal } from './fixtures';

const text = (blocks: readonly Block[]) =>
  blocks
    .map((b) =>
      'text' in b ? b.text : 'label' in b ? `${b.label} ${'value' in b ? b.value : ''}` : '',
    )
    .join('\n');

describe('the report', () => {
  const model = reportModel(completed(), tr, today);
  const all = text(model.blocks);
  it('covers the data, every item, what is not checked and the benefit', () => {
    expect(all).toContain('Despido improcedente');
    expect(all).toContain('01-03-2010');
    expect(all).toContain('Indemnización');
    expect(all).toContain('Por debajo del mínimo legal: faltan 438,41');
    expect(all).toContain('Lo que esta revisión no comprueba');
    expect(all).toContain('Salarios de tramitación');
    expect(all).toContain('Tu paro (estimación)');
    expect(all).toContain('720 días');
  });
  it('says the holiday unit in the data and under the holiday item', () => {
    expect(all).toContain('30 días naturales al año; 0 disfrutados');
    expect(all).toContain('Hemos contado 0 días naturales disfrutados de 30 al año.');
    const working = text(
      reportModel(
        completed({
          ...unfairDismissal,
          holidayUnit: 'working',
          annualHolidayDays: 22,
          holidayDaysTaken: 5,
        }),
        tr,
        today,
      ).blocks,
    );
    expect(working).toContain('22 días laborables (5 por semana) al año; 5 disfrutados');
    expect(working).toContain('22 días laborables equivalen a 30 naturales');
  });
  it('cites every source with its link and the date it is in force from', () => {
    const sources = model.blocks.filter((b) => b.type === 'source');
    expect(sources.length).toBeGreaterThan(5);
    expect(sources).toContainEqual({
      type: 'source',
      text: 'Estatuto de los Trabajadores, art. 56 · en vigor desde 13-11-2015',
      url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2015-11430#a56',
    });
  });
  it('dates itself and the law it applies', () => {
    expect(all).toContain('7 de octubre de 2026');
    expect(model.footer).toContain('Cifras según la ley en vigor el 7 de octubre de 2026');
  });
});

describe('the report of an objective dismissal', () => {
  it('carries the unfair-dismissal reference as a note under severance', () => {
    const r = completed({
      ...unfairDismissal,
      cause: 'objective_dismissal',
      startDate: { y: 2024, m: 1, d: 1 },
      endDate: { y: 2026, m: 6, d: 30 },
      monthlySalary: 3000,
      noticeDaysReceived: 15,
    });
    const notes = reportModel(r, tr, today).blocks.filter((b) => b.type === 'note');
    expect(notes).toContainEqual({
      type: 'note',
      text: expect.stringMatching(/^Referencia: .* sería de 8\.136,99\s€ \(33 días/),
    });
  });
});

describe('the letter', () => {
  it('lists only what falls short, with both figures and the difference', () => {
    const bullets = letterModel(completed(), tr).blocks.filter((b) => b.type === 'bullet');
    expect(bullets).toHaveLength(1);
    expect(bullets[0]).toMatchObject({
      text: expect.stringMatching(
        /^Indemnización: la propuesta recoge 40\.000,00\s€ y el mínimo legal es 40\.438,41\s€; faltan 438,41\s€\.$/,
      ),
    });
  });
  it('a deduction above its maximum reads as such', () => {
    const r = completed(
      { ...unfairDismissal, cause: 'resignation', agreementNoticeDays: 15, noticeDaysGiven: 0 },
      { notice_deduction: 5000 },
    );
    const bullets = letterModel(r, tr).blocks.filter((b) => b.type === 'bullet');
    expect(bullets[0]).toMatchObject({
      text: expect.stringContaining('la propuesta descuenta 5.000,00'),
    });
  });
  it('leaves name, ID, company, place and date for the person to write', () => {
    const blanks = letterModel(completed(), tr).blocks.filter((b) => b.type === 'blank');
    expect(blanks.map((b) => ('label' in b ? b.label : ''))).toEqual([
      'Nombre y apellidos',
      'DNI o NIE',
      'Empresa',
      'Nombre y apellidos',
    ]);
  });
  it('with nothing added, the place and date are left to write too', () => {
    const lines = letterModel(completed(), tr).blocks.filter((b) => b.type === 'text');
    expect(lines.map((b) => ('text' in b ? b.text : ''))).toContain(
      'En ____________________, a ____ de ____________________ de ________',
    );
    expect(
      letterModel(completed(), tr)
        .blocks.filter((b) => b.type === 'blank')
        .every((b) => !('value' in b)),
    ).toBe(true);
  });
  it('fills each line the person filled, and leaves the empty ones', () => {
    const blocks = letterModel(completed(), tr, {
      name: '  Alex Ejemplo ',
      id: '',
      company: 'Empresa Ficticia SL',
      place: 'Logroño',
      date: null,
    }).blocks;
    expect(blocks.filter((b) => b.type === 'blank')).toEqual([
      { type: 'blank', label: 'Nombre y apellidos', value: 'Alex Ejemplo' },
      { type: 'blank', label: 'DNI o NIE' },
      { type: 'blank', label: 'Empresa', value: 'Empresa Ficticia SL' },
      { type: 'blank', label: 'Nombre y apellidos', value: 'Alex Ejemplo' },
    ]);
    expect(text(blocks)).toContain('En Logroño, a ____ de ____________________ de ________');
  });
  it('with nothing short, a general letter: received without agreeing, no item listed', () => {
    const r = completed(unfairDismissal, { severance: 41000 });
    expect(letterKind(r.review)).toBe('general');
    expect(letterKind(completed().review)).toBe('items');
    const blocks = letterModel(r, tr).blocks;
    expect(blocks.filter((b) => b.type === 'bullet')).toEqual([]);
    const all = text(blocks);
    expect(all).toContain(
      'He recibido la propuesta de liquidación (finiquito) por el fin de mi contrato, con fecha de baja el 15-09-2026, y hago constar que la recibo sin mostrar mi conformidad con su contenido.',
    );
    expect(all).toContain(
      'Este recibí deja constancia de que he recibido el documento, no de que esté de acuerdo con sus cantidades.',
    );
    expect(all).toContain('En ____________________, a ____ de ____________________ de ________');
    expect(all).not.toContain('hago constar que no estoy conforme con estas cantidades');
  });
  it('gives no advice and asks for nothing', () => {
    const all = [completed(), completed(unfairDismissal, { severance: 41000 })]
      .map((r) => text(letterModel(r, tr).blocks))
      .join('\n')
      .toLowerCase();
    for (const word of [/\bfirma/, /\breclam/, /\bdemand/, /está bien/, /es correcto/])
      expect(all).not.toMatch(word);
  });
});

describe('the report of the extended final pay', () => {
  const reportOf = (o: Partial<typeof unfairDismissal>) =>
    text(reportModel(completed({ ...unfairDismissal, ...o }, {}), tr, today).blocks);

  it('a collective dismissal: its cause and the minimum the agreement may improve', () => {
    const all = reportOf({ cause: 'collective_dismissal' });
    expect(all).toContain('Despido colectivo (ERE)');
    expect(all).toContain('O más, según el acuerdo del ERE');
    expect(all).toContain('El despido colectivo es situación legal de desempleo');
  });

  it('a cause not known: no severance figure and a benefit that depends on it', () => {
    const all = reportOf({ cause: 'unknown' });
    expect(all).toContain('Sin la causa no se calcula la indemnización');
    expect(all).toContain('Depende de la causa');
  });

  it('unpaid: the interest with its working, apart from the items', () => {
    const all = reportOf({ paid: false });
    expect(all).toContain('Si aún no te han pagado');
    expect(all).toContain('10 % al año ×');
    expect(all).toContain('te quedan 343 días para reclamarlo');
    expect(reportOf({})).not.toContain('Si aún no te han pagado');
  });
});
