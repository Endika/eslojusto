import { describe, expect, it } from 'vitest';
import { letterKind } from '../../src/documents/case';
import type { Block } from '../../src/documents/ports';
import { letterModel, reportModel } from '../../src/documents/report';
import { estimateBenefit } from '../../src/engine/unemployment';
import type { FinalPayInput } from '../../src/engine/types';
import { completed, today, tr, unfairDismissal } from './fixtures';

const text = (blocks: readonly Block[]) =>
  blocks
    .map((b) =>
      'text' in b ? b.text : 'label' in b ? `${b.label} ${'value' in b ? b.value : ''}` : '',
    )
    .join('\n');

// The blocks as «type: text», a row as «row: label = value».
const lines = (blocks: readonly Block[]) =>
  blocks.map((b) =>
    'text' in b
      ? `${b.type}: ${b.text}`
      : 'label' in b
        ? `${b.type}: ${b.label} = ${'value' in b ? b.value : ''}`
        : b.type,
  );

// The kinds of block in order, one after another counted: «row×6».
const shape = (blocks: readonly Block[]) =>
  blocks
    .reduce<[string, number][]>((runs, b) => {
      const last = runs[runs.length - 1];
      if (last?.[0] === b.type) last[1] += 1;
      else runs.push([b.type, 1]);
      return runs;
    }, [])
    .map(([type, n]) => (n > 1 ? `${type}×${n}` : type))
    .join(' ');

const reportOf = (o: Partial<FinalPayInput>, figures = {}) =>
  reportModel(completed({ ...unfairDismissal, ...o }, figures), tr, today).blocks;

describe('the shape of the report', () => {
  it('goes from the title to the benefit and its sources', () => {
    expect(shape(reportModel(completed(), tr, today).blocks)).toBe(
      'title meta rule text heading row×6 heading subheading row×2 text note source subheading row×2 text note×3 source subheading row×2 text note source×3 heading bullet×4 heading text note text note text note source×6',
    );
  });
  it('puts the interest of an unpaid final pay before the benefit', () => {
    expect(shape(reportOf({ paid: false }))).toContain(
      'heading bullet×4 heading text×3 note source×2 heading text note',
    );
  });
  it('writes the benefit and the amounts by the stretches it has', () => {
    const benefit = (o: Partial<FinalPayInput>) => lines(reportOf(o)).join('\n');
    expect(benefit({})).toContain(
      'Serían unos 1.225\u00a0€ al mes los primeros 6 meses y unos 1.225\u00a0€ después, en bruto.',
    );
    expect(benefit({})).toContain('text: Unos 720 días (24 meses), el máximo.');
    expect(benefit({ startDate: { y: 2025, m: 3, d: 1 } })).toContain(
      'Serían unos 1.225\u00a0€ al mes, en bruto.',
    );
    expect(benefit({ startDate: { y: 2025, m: 3, d: 1 } })).toContain(
      'note: Las vacaciones pagadas y no disfrutadas también cuentan',
    );
    expect(benefit({})).not.toContain(
      'note: Las vacaciones pagadas y no disfrutadas también cuentan',
    );
  });
  it('without the amounts, says why: a short contract or a low base', () => {
    const benefit = (o: Partial<FinalPayInput>) => lines(reportOf(o));
    expect(benefit({ monthlySalary: 300 })).toContain(
      'text: Con este salario no podemos estimar la cuantía (puede ser jornada parcial); depende de tus bases de cotización.',
    );
    expect(benefit({ startDate: { y: 2026, m: 6, d: 1 } })).toContain(
      'text: Depende de tus últimas nóminas. La cantidad sale de lo cotizado en los últimos 180 días (art. 270.1 LGSS) y este contrato dura menos, así que entra otro trabajo que esta revisión no conoce.',
    );
  });
  it('gives a range of amounts when the children are not known', () => {
    const input = { ...unfairDismissal, monthlySalary: 3000 };
    const r = completed(input);
    const unknown = { ...r, benefit: estimateBenefit(input, null) };
    expect(lines(reportModel(unknown, tr, today).blocks).join('\n')).toContain(
      'Serían entre 1.225\u00a0€ y 1.575\u00a0€ al mes los primeros 6 meses y entre 1.225\u00a0€ y 1.575\u00a0€ después, en bruto.',
    );
  });
});

describe('the data and items of the report, line by line', () => {
  const has = (blocks: readonly Block[], line: string) => lines(blocks).includes(line);
  const startsWith = (blocks: readonly Block[], start: string) =>
    lines(blocks).some((l) => l.startsWith(start));

  it('writes an item with one figure, a range, or none', () => {
    const blocks = reportOf({});
    expect(has(blocks, 'row: Mínimo legal = 1.071,43\u00a0€')).toBe(true);
    expect(has(blocks, 'row: Mínimo legal = entre 1.493,93\u00a0€ y 1.517,86\u00a0€')).toBe(true);
    expect(has(blocks, 'row: En tu finiquito = Sin cifra')).toBe(true);
    expect(has(blocks, 'row: En tu finiquito = 40.000,00\u00a0€')).toBe(false);
    expect(has(reportOf({}, { severance: 40000 }), 'row: En tu finiquito = 40.000,00\u00a0€')).toBe(
      true,
    );
  });

  it('writes a deduction by the most it may take, and an item without a range as depending', () => {
    const resigned = reportOf(
      { cause: 'resignation', agreementNoticeDays: 15, noticeDaysGiven: 0 },
      { notice_deduction: 5000 },
    );
    expect(has(resigned, 'row: Máximo que pueden descontarte = 1.071,43\u00a0€')).toBe(true);
    expect(has(resigned, 'row: En tu finiquito = 5.000,00\u00a0€')).toBe(true);
    expect(startsWith(resigned, 'row: Mínimo legal = 5')).toBe(false);
    expect(lines(reportOf({ holidayDaysTaken: null }))).toContain(
      'row: Mínimo legal = Depende de los días que has disfrutado',
    );
  });

  it('adds the notes an item has: the count, the agreement and where it was read', () => {
    const blocks = reportOf({});
    expect(has(blocks, 'note: Hemos contado 0 días naturales disfrutados de 30 al año.')).toBe(
      true,
    );
    expect(
      has(blocks, 'note: Tu convenio puede mejorar esta cifra (más días, otro devengo).'),
    ).toBe(true);
    const unknown = reportOf({ holidayDaysTaken: null });
    expect(startsWith(unknown, 'note: Hemos contado')).toBe(false);
    expect(startsWith(unknown, 'note: Tu convenio puede mejorar')).toBe(false);
    expect(
      has(blocks, 'source: Estatuto de los Trabajadores, art. 26 · en vigor desde 13-11-2015'),
    ).toBe(true);
    expect(
      has(
        blocks,
        'source: Orden PJC/297/2026, normas de cotización a la Seguridad Social para 2026 · con efectos desde 01-01-2026',
      ),
    ).toBe(true);
  });

  it('names the cause with the kind of fixed term only for the end of a fixed term', () => {
    const fixed = { cause: 'fixed_term_end', fixedTermType: 'training' } as const;
    expect(has(reportOf(fixed), 'row: Causa = Fin de contrato temporal (formativo)')).toBe(true);
    expect(
      has(
        reportOf({ ...unfairDismissal, fixedTermType: 'training' }),
        'row: Causa = Despido improcedente',
      ),
    ).toBe(true);
  });

  it('writes the extra pay and the holidays as the person gave them', () => {
    const own = {
      extraPayProrated: false,
      extraPayCount: 2,
      extraPayAmount: 1000,
      holidayUnit: 'working',
      annualHolidayDays: 22,
      holidayDaysTaken: null,
    } as const;
    const blocks = reportOf(own);
    expect(has(blocks, 'row: Pagas extra = 2 pagas de 1.000,00\u00a0€')).toBe(true);
    expect(
      has(
        blocks,
        'row: Vacaciones = 22 días laborables (5 por semana) al año; disfrutados, sin dato',
      ),
    ).toBe(true);
    expect(
      has(
        reportOf({ ...own, workDaysPerWeek: 4, holidayDaysTaken: 3 }),
        'row: Vacaciones = 22 días laborables (4 por semana) al año; 3 disfrutados',
      ),
    ).toBe(true);
  });

  it('writes the interest of an unpaid final pay with its amount, and the time left', () => {
    const blocks = reportOf({ paid: false });
    expect(
      startsWith(
        blocks,
        'text: Lo que es salario lleva un interés por el retraso del 10 % al año (art. 29.3 ET): unos 6,46\u00a0€ desde la baja hasta hoy.',
      ),
    ).toBe(true);
    expect(
      startsWith(
        blocks,
        'text: Para reclamar las cantidades del finiquito hay un año desde la baja (art. 59.1 y 59.2 ET): te quedan 343 días para reclamarlo.',
      ),
    ).toBe(true);
    expect(
      startsWith(
        blocks,
        'note: Cómo se calcula: 10 % al año × 1.071,43 € × 22 días desde la baja / 365 = 6,46 €.',
      ),
    ).toBe(true);
  });

  it('on the last day to claim still shows the working; once it is past, no longer', () => {
    const lastDay = reportOf({ paid: false, endDate: { y: 2025, m: 10, d: 7 } });
    expect(
      startsWith(
        lastDay,
        'text: Para reclamar las cantidades del finiquito hay un año desde la baja (art. 59.1 y 59.2 ET): hoy es el último día.',
      ),
    ).toBe(true);
    expect(startsWith(lastDay, 'note: Cómo se calcula: 10 % al año')).toBe(true);
    const past = reportOf({ paid: false, endDate: { y: 2025, m: 10, d: 6 } });
    expect(startsWith(past, 'text: Ha pasado más de un año desde la baja')).toBe(true);
    expect(startsWith(past, 'note: Cómo se calcula: 10 % al año')).toBe(false);
  });

  it('writes the amounts of a benefit with no duration as two stretches, and the deduction', () => {
    const blocks = reportOf({ startDate: { y: 2025, m: 12, d: 1 } });
    expect(lines(blocks)).toContain(
      'text: Serían unos 1.225\u00a0€ al mes los primeros 6 meses y unos 1.225\u00a0€ después, en bruto.',
    );
    expect(lines(blocks)).toContain(
      'note: De ahí se descuentan unos 104\u00a0€ al mes de Seguridad Social y el IRPF que te corresponda, que esta revisión no calcula.',
    );
  });
});

describe('the shape of the letters', () => {
  it('lists what falls short between its blanks and its closing lines', () => {
    expect(shape(letterModel(completed(), tr).blocks)).toBe(
      'title blank×3 text bullet text×3 blank',
    );
  });
});

describe('the report', () => {
  const model = () => reportModel(completed(), tr, today);
  const all = () => text(model().blocks);
  it('says the holiday unit in the data and under the holiday item', () => {
    expect(all()).toContain('30 días naturales al año; 0 disfrutados');
    expect(all()).toContain('Hemos contado 0 días naturales disfrutados de 30 al año.');
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
    expect(working).toContain('toma 22 días laborables como los 30 naturales');
  });
  it('dates itself and the law it applies', () => {
    expect(all()).toContain('7 de octubre de 2026');
    expect(model().footer).toContain('Cifras según la ley en vigor el 7 de octubre de 2026');
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
});
