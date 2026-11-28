import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import { RENTAL_TABLES } from '../../src/engine/rental/data/tables';
import { reviewRental } from '../../src/engine/rental/review';
import type { RentalInput } from '../../src/engine/rental/types';
import type { Block, DocumentModel } from '../../src/documents/ports';
import type { Translate } from '../../src/i18n/client';
import { sans } from '../../src/documents/fonts/sans';
import { serif } from '../../src/documents/fonts/serif';
import { NO_DETAILS } from '../../src/documents/letter';
import { STYLES } from '../../src/documents/pdf';
import { PdfDocument } from '../../src/documents/pdf-writer';
import { depositLetter, rentLetter } from '../../src/rental/letters';
import { rentalReport } from '../../src/rental/report';
import { NORMS_BEFORE_VOTE } from '../engine/rental/norms-before-vote';
import { FORBIDDEN } from '../support/forbidden';
import type { ItemReading } from '../../src/engine/rental/item';
import type { IndexId } from '../../src/engine/rental/indices';
import type { RateFigure, RentUpdateReading } from '../../src/engine/rental/rent-update';
import type { RentalReview } from '../../src/engine/rental/review';
import type { CompletedRentalReview } from '../../src/rental/ports';
import {
  contract,
  keys,
  repealedWindow,
  review,
  riseAboveIrav,
  shape,
  TODAY,
  tr,
  unknownLargeLandlord,
  update,
} from './fixtures';

const report = (input: RentalInput): DocumentModel =>
  rentalReport({ review: review(input), input, detail: 'unlocked' }, tr, TODAY);

const text = (blocks: readonly Block[]) =>
  blocks
    .map((b) =>
      'text' in b ? b.text : 'label' in b ? `${b.label} ${'value' in b ? b.value : ''}` : '',
    )
    .join('\n');

// A 2025 rise above the IRAV, an agency fee and a deposit with 150 € still out.
const full: RentalInput = {
  ...riseAboveIrav,
  fees: [{ kind: 'agency_fee', amount: 500, deductedLater: false, requestedInWriting: null }],
  moveOut: {
    keysReturnedOn: f('2026-06-30'),
    returns: [{ on: f('2026-08-14'), amount: 850 }],
    deductions: [],
  },
};

describe('the rental report', () => {
  const built = () => {
    const model = report(full);
    return { model, all: text(model.blocks) };
  };

  it('gives the data the person confirmed', () => {
    const { model, all } = built();
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Fecha del contrato',
      value: '15-03-2024',
    });
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Actualización de la renta',
      value: 'El IPC',
    });
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Llaves devueltas el',
      value: '30-06-2026',
    });
    expect(all).toContain('Comunidad de Madrid');
  });

  it('gives each item with its exact figures and its calculation', () => {
    const { all } = built();
    expect(all).toContain('Subida del 20-03-2025');
    // 9,20 a month from March 2025 to May 2026, the month before the keys: 15 months = 138 €.
    expect(all).toMatch(/Pagas de más: 138,00\s€/);
    expect(all).toMatch(/Renta máxima 1\.020,80\s€/);
    expect(all).toMatch(/De más cada mes 9,20\s€/);
    expect(all).toMatch(/Pagas de más: 500,00\s€/);
    expect(all).toMatch(/Te deben 150,00\s€/);
    // 138 € for the rise and 500 € of agency fee.
    expect(all).toMatch(/Pagas o has pagado de más al menos 638,00\s€\./);
  });

  it('gives both readings of a doubt, and what the total takes of it', () => {
    const { all } = built();
    expect(all).toMatch(
      /Depende de si el año de intereses cuenta 365 días o 360: te deben 1,98\s€ o te deben 2,01\s€/,
    );
    expect(all).toMatch(/Al total se suma solo la cuenta más baja: 1,98\s€\./);
    expect(all).toContain('Una cuenta');
    expect(all).toContain('La otra cuenta');
  });

  it('lists each index with its month and publication day', () => {
    const { model } = built();
    const at = model.blocks.findIndex(
      (b) => b.type === 'heading' && b.text === 'Índices usados, con su mes y su publicación',
    );
    expect(model.blocks.slice(at + 1, at + 3)).toEqual([
      { type: 'bullet', text: 'IPC de febrero de 2025: 3 %, publicado el 14-03-2025' },
      { type: 'bullet', text: 'IRAV de febrero de 2025: 2,08 %, publicado el 14-03-2025' },
    ]);
  });

  it('gives each norm once with how it stands, linked', () => {
    const { model, all } = built();
    const at = model.blocks.findIndex(
      (b) => b.type === 'heading' && b.text === 'Las normas y su estado',
    );
    const norms = model.blocks.slice(at + 1).filter((b) => b.type === 'source');
    const deposit = norms.find(
      (b) =>
        b.type === 'source' &&
        b.text ===
          'LAU, art. 36.4 (Ley 29/1994, de 24 de noviembre, de Arrendamientos Urbanos) · en vigor',
    );
    expect(deposit).toMatchObject({ url: expect.stringMatching(/^https:\/\/www\.boe\.es\//) });
    expect(all).not.toContain('Real Decreto-ley 28/2026');
    expect(all).not.toContain('pendiente de convalidación');
  });

  it('gives RDL 28/2026 as pending when it awaited the vote, as the report read before 12-11-2026', () => {
    const before = reviewRental(full, TODAY, { ...RENTAL_TABLES, norms: NORMS_BEFORE_VOTE });
    if (!before.ok) throw new Error('invalid');
    const pending = text(
      rentalReport({ review: before.review, input: full, detail: 'unlocked' }, tr, TODAY).blocks,
    );
    expect(pending).toMatch(/Real Decreto-ley 28\/2026.* · pendiente de convalidación/);
  });

  it('every item cites its sources with the days they had effect', () => {
    const { model } = built();
    expect(model.blocks).toContainEqual(
      expect.objectContaining({
        type: 'source',
        text: 'LAU, art. 18.1 (Real Decreto-ley 7/2019, de 1 de marzo) · con efectos desde el 06-03-2019 · en vigor',
      }),
    );
  });

  it('gives the information blocks, what is not checked and the day it was made', () => {
    const { model, all } = built();
    expect(all).toContain('Para que lo tengas en cuenta');
    expect(all).toContain('Depósito de la fianza');
    expect(all).toContain('Lo que esta revisión no comprueba');
    expect(all).toContain('Si los desperfectos justifican un descuento de la fianza.');
    expect(all).toContain('eslojusto.es · 8 de octubre de 2026');
    expect(model.footer).toContain('8 de octubre de 2026');
  });

  it('shows a repealed window with both readings, out of the total', () => {
    const repealed = text(report(repealedWindow).blocks);
    expect(repealed).toContain('Depende de cómo se lea una norma que ya está derogada');
    expect(repealed).toContain('No se suma al total mientras esa duda siga abierta.');
    expect(repealed).toMatch(/derogada el 30-04-2026/);
  });

  it('gives no advice', () => {
    const { all } = built();
    for (const forbidden of FORBIDDEN) expect(all.toLowerCase()).not.toMatch(forbidden);
  });
});

describe('the rental documents', () => {
  it('use only characters both fonts can draw', () => {
    // The writer turns these spaces into plain ones.
    const substituted = new Set(['\u00a0', '\u202f', '\u2009']);
    const missing = new Set<string>();
    for (const input of [full, repealedWindow]) {
      const r = { review: review(input), input, detail: 'unlocked' as const };
      for (const model of [
        rentalReport(r, tr, TODAY),
        depositLetter(r, TODAY, NO_DETAILS, tr),
        rentLetter(r, NO_DETAILS, tr),
      ])
        for (const c of text(model.blocks)) {
          const code = String(c.codePointAt(0));
          if (c !== '\n' && !substituted.has(c) && !(code in sans.glyphs && code in serif.glyphs))
            missing.add(c);
        }
    }
    expect([...missing]).toEqual([]);
  });
});

describe('the rental report on the page', () => {
  // A row puts its value on the right and wraps its label in what is left: the value, and the
  // longest word of the label beside it, must fit the page.
  it('never has a row wider than the page', () => {
    const doc = new PdfDocument({ sans, serif }, 'x');
    const longFlash: RentalInput = {
      ...full,
      updates: [update('2025-03-20', 1000, 1030, { agreedInWriting: null })],
    };
    for (const input of [full, repealedWindow, longFlash]) {
      const model = rentalReport({ review: review(input), input, detail: 'unlocked' }, tr, TODAY);
      for (const b of model.blocks) {
        if (b.type !== 'row') continue;
        const word = Math.max(...b.label.split(' ').map((w) => doc.measure(w, STYLES.row)));
        expect(
          doc.measure(b.value, STYLES.row) + 16 + word,
          `${b.label}: ${b.value}`,
        ).toBeLessThanOrEqual(doc.width);
      }
    }
  });

  it('names the cap’s norm on its own line, not in the row', () => {
    const model = report(full);
    expect(model.blocks).toContainEqual({
      type: 'row',
      label: 'Tope legal',
      value: 'IRAV de febrero de 2025: 2,08 %, publicado el 14-03-2025',
    });
    expect(model.blocks).toContainEqual(
      expect.objectContaining({
        type: 'bullet',
        text: expect.stringMatching(/^Tope legal: .*INE\)$/),
      }),
    );
  });
});

describe('a blank line with a long value', () => {
  it('wraps it at full size instead of shrinking it', () => {
    const doc = new PdfDocument({ sans, serif }, 'x');
    const drawn: { text: string; size: number }[] = [];
    const textAt = doc.textAt.bind(doc);
    doc.textAt = (text, x, top, style, page) => {
      drawn.push({ text, size: style.size });
      textAt(text, x, top, style, page);
    };
    const address =
      'Calle de la Avenida Inventada Muy Larga 123, Escalera B, Piso 4.º Izquierda, Villaficticia de Abajo';
    doc.blank('Vivienda', STYLES.label, doc.width * 0.7, address, STYLES.row, true);
    const lines = drawn.filter((d) => d.text !== 'Vivienda');
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => l.size === STYLES.row.size)).toBe(true);
    expect(lines.map((l) => l.text).join(' ')).toBe(address);
  });
});

const completed = (input: RentalInput): CompletedRentalReview => ({
  review: review(input),
  input,
  detail: 'unlocked',
});
const lines = (r: CompletedRentalReview, t: Translate = keys) => shape(rentalReport(r, t, TODAY));

describe('the rental report, block by block', () => {
  const between = (all: readonly string[], from: string, to: string) =>
    all.slice(
      all.indexOf(`heading: client.rental.report.${from}`) + 1,
      all.indexOf(`heading: client.rental.report.${to}`),
    );
  const eur = (n: string) => `${n}${String.fromCharCode(160)}€`;

  it('is made of its sections, in order, with the day it was made', () => {
    const model = rentalReport(completed(full), keys, TODAY);
    const all = shape(model);
    expect(all.slice(0, 4)).toEqual([
      'title: client.rental.report.title',
      'meta: client.documents.report.generated {"fecha":"8 de octubre de 2026"}',
      'rule: ',
      'text: client.rental.report.intro',
    ]);
    expect(all.filter((l) => l.startsWith('heading: '))).toEqual(
      ['your_data', 'summary', 'items', 'indices', 'norms', 'information', 'unchecked'].map(
        (k) => `heading: client.rental.report.${k}`,
      ),
    );
    expect(model.title).toBe('client.rental.report.title');
    expect(model.footer).toBe('client.rental.report.footer {"fecha":"8 de octubre de 2026"}');
  });

  it('leaves out the index and information sections when there is nothing in them', () => {
    const bare = completed(contract());
    const noInformation = { ...bare, review: { ...bare.review, information: [] } };
    const headings = lines(noInformation).filter((l) => l.startsWith('heading: '));
    expect(headings).not.toContain('heading: client.rental.report.indices');
    expect(headings).not.toContain('heading: client.rental.report.information');
    expect(
      lines(noInformation).filter((l) => l.startsWith('subheading: client.rental.info')),
    ).toEqual([]);
  });

  it('gives the data as the review read it, a figure or its absence, an answer or «no sé»', () => {
    const rows = (input: RentalInput) =>
      Object.fromEntries(
        lines(completed(input))
          .filter((l) => l.startsWith('row: client.rental.report.'))
          .map(
            (l) => l.slice('row: client.rental.report.'.length).split(' | ') as [string, string],
          ),
      );
    expect(rows(contract({ largeLandlord: true, stressedZone: false }))).toMatchObject({
      large_landlord: 'client.rental.answer.yes',
      stressed_zone: 'client.rental.answer.no',
      deposit: eur('1.000,00'),
      advance: 'client.rental.report.no_figure',
      agreed_months: 'client.rental.report.months {"meses":"60"}',
      clause: 'client.rental.report.clause.ipc',
    });
    expect(rows(contract({ largeLandlord: null, deposit: null, advanceMonths: 2 }))).toMatchObject({
      large_landlord: 'client.rental.answer.unknown',
      deposit: 'client.rental.report.no_figure',
      advance: '2',
    });
    expect(rows(contract({ updateClause: 'fixed_percent', fixedPercent: 3 }))['clause']).toBe(
      'client.rental.report.clause.fixed_percent {"tasa":"3 %"}',
    );
    expect(rows(contract({ updateClause: 'ipc', fixedPercent: 3 }))['clause']).toBe(
      'client.rental.report.clause.ipc',
    );
    const unpriced = {
      ...completed(contract()),
      input: contract({ updateClause: 'fixed_percent' }),
    };
    expect(lines(unpriced)).toContain(
      'row: client.rental.report.clause | client.rental.report.clause.fixed_percent',
    );
    expect(rows(contract())).not.toHaveProperty('keys');
    expect(rows(full)['keys']).toBe('30-06-2026');
  });

  it.each([
    [
      'totals nothing counted yet',
      unknownLargeLandlord,
      ['client.rental.total.paidOver_doubtful {"maximo":"1.230,00 €"}'],
    ],
    [
      'a total with its most',
      full,
      [
        'client.rental.total.paidOver {"importe":"638,00 €"}',
        'client.rental.total.owed_up_to {"importe":"151,98 €","maximo":"152,01 €"}',
      ],
    ],
  ] as const)('gives %s', (_, input, bullets) => {
    const summary = between(lines(completed(input)), 'summary', 'items');
    expect(summary.slice(1)).toEqual(
      bullets.map((b) => `bullet: ${b.replaceAll(' €', String.fromCharCode(160) + '€')}`),
    );
    expect(summary[0]).toMatch(/^text: client.rental.headline\./);
  });

  describe('each item and its readings', () => {
    const reading = (status: ItemReading['status'], amount: number | null): ItemReading => ({
      status,
      amount,
      calculation: [],
      rules: [],
    });
    const only = (outcome: unknown): CompletedRentalReview => {
      const r = completed(full);
      const fee = r.review.items.find((i) => i.kind === 'fee');
      const item = { ...fee, outcome, sources: [] } as unknown as RentalReview['items'][number];
      return { ...r, review: { ...r.review, items: [item], information: [] } };
    };
    const single = (value: ItemReading) => ({ kind: 'single', value });
    const depends = (low: ItemReading, high: ItemReading) => ({
      kind: 'depends',
      reasons: ['interest_day_count'],
      low,
      high,
      readings: [{ value: low }, { value: high }],
    });
    const item = (outcome: unknown) => between(lines(only(outcome)), 'items', 'norms').slice(1);

    it('titles each item and keeps the landlord hint for a rise', () => {
      const r = only(single(reading('within_limit', null)));
      const [title] = between(lines(r), 'items', 'norms');
      expect(title).toMatch(/^subheading: client.rental.item.fee /);
      const hinted = {
        ...r,
        review: {
          ...r.review,
          items: r.review.items.map((i) => ({ ...i, companyLandlordHint: true })),
        },
      };
      expect(lines(hinted)).not.toContain('note: client.rental.hint.company_landlord');
    });
    const how = 'note: client.rental.report.how';
    const reading_ = 'text: client.rental.detail.reading_';
    const motive = 'client.rental.reason.interest_day_count';

    it.each([
      [
        'a figured result with no figure',
        reading('over_cap', null),
        'text: client.rental.status.over_cap_no_amount',
      ],
      [
        'a result with no euros',
        reading('within_limit', null),
        'text: client.rental.status.within_limit',
      ],
    ])('says one reading of %s', (_, value, text) => {
      expect(item(single(value))).toEqual([text, how]);
    });

    it.each([
      [
        'a figured result with no figure',
        reading('over_cap', null),
        reading('over_cap', null),
        'reading.over_cap',
        'reading.over_cap',
        null,
      ],
    ])('says both readings of a doubt with %s', (_, low, high, one, other, share) => {
      const text = item(depends(low, high))[0];
      expect(text).toMatch(
        new RegExp(
          `^text: client.rental.depends_status .*"una":"client.rental.${one}.*"otra":"client.rental.${other}`,
        ),
      );
      expect(text).toContain(motive);
      expect(item(depends(low, high)).slice(1)).toEqual([
        ...(share ? [share] : []),
        how,
        `${reading_}low`,
        `${reading_}high`,
      ]);
    });
  });
});

describe('the rental report, indices and norms', () => {
  const section = (all: readonly string[], from: string, to: string) =>
    all.slice(all.indexOf(`heading: ${from}`) + 1, all.indexOf(`heading: ${to}`));
  const INDICES = 'Índices usados, con su mes y su publicación';
  const NORMS = 'Las normas y su estado';

  const figure = (index: IndexId, month: string, flash = false): RateFigure => ({
    kind: 'index',
    figure: { index, month, rate: 3, publishedOn: '2025-03-14', flash, clampedFrom: null },
  });
  const withRates = (agreed: RateFigure | null, cap: RateFigure | null): CompletedRentalReview => {
    const r = completed(riseAboveIrav);
    const items = r.review.items.map((i): RentalReview['items'][number] => {
      if (i.kind !== 'rent_update' || i.outcome.kind !== 'single') return i;
      const value: RentUpdateReading = {
        ...i.outcome.value,
        agreed,
        cap: cap && { rule: 'cap_irav', rate: cap },
      };
      return { ...i, outcome: { ...i.outcome, value } };
    });
    return { ...r, review: { ...r.review, items } };
  };
  const listed = (r: CompletedRentalReview) => section(lines(r, tr), INDICES, NORMS);

  it.each([
    [
      'by month first',
      figure('ipc', '2026-01'),
      figure('irav', '2025-02'),
      [
        'bullet: IRAV de febrero de 2025: 3 %, publicado el 14-03-2025',
        'bullet: IPC de enero de 2026: 3 %, publicado el 14-03-2025',
      ],
    ],
  ] as const)('lists the indices %s', (_, agreed, cap, expected) => {
    expect(listed(withRates(agreed, cap))).toEqual(expected);
  });

  it('gives a norm once, with its days when a wording ended and how it stands otherwise', () => {
    const once = section(lines(completed(full), tr), NORMS, 'Para que lo tengas en cuenta');
    expect(new Set(once).size).toBe(once.length);
    expect(once.filter((l) => l.includes('art. 36.4'))).toHaveLength(1);
    const norms = section(
      lines(completed(repealedWindow), tr),
      NORMS,
      'Para que lo tengas en cuenta',
    );
    expect(norms).toContain(
      'source: art. 2 (Real Decreto-ley 8/2026, de 20 de marzo) · derogada el 30-04-2026',
    );
    expect(norms).toContain(
      'source: LAU, art. 36.1 (Ley 29/1994, de 24 de noviembre, de Arrendamientos Urbanos) · en vigor',
    );
    const withUntil = section(
      lines(completed(contract()), tr),
      NORMS,
      'Para que lo tengas en cuenta',
    );
    expect(withUntil).toContain(
      'source: disposición final 6.ª (Real Decreto-ley 29/2026, de 6 de octubre) · con efectos del 08-10-2026 al 31-12-2027',
    );
  });

  it('adds the company hint to a rise whose landlord may be a large one', () => {
    const hinted = completed({ ...unknownLargeLandlord, landlordType: 'company' });
    expect(lines(hinted, keys)).toContain('note: client.rental.hint.company_landlord');
    expect(lines(completed(unknownLargeLandlord), keys)).not.toContain(
      'note: client.rental.hint.company_landlord',
    );
  });
});

describe('the rental report, the shape of its sections', () => {
  const runs = (all: readonly string[]) =>
    all
      .map((l) => l.slice(0, l.indexOf(':')))
      .reduce<string[]>((out, type, i, types) => {
        if (type === types[i - 1]) {
          const last = out.pop() ?? '';
          const [name = '', n = '1'] = last.split('*');
          return [...out, `${name}*${Number(n) + 1}`];
        }
        return [...out, type];
      }, []);
  const item = (r: CompletedRentalReview, kind: string) => {
    const all = lines(r);
    const at = all.findIndex((l) => l.startsWith(`subheading: client.rental.item.${kind}`));
    const next = all.findIndex((l, i) => i > at && /^(sub)?heading: /.test(l));
    return all.slice(at, next);
  };

  it('puts each reading of an item under its own title, with its figures and its calculation', () => {
    expect(runs(item(completed(full), 'rent_update'))).toEqual([
      'subheading',
      'text',
      'note',
      'row*8',
      'bullet*7',
      'source*4',
    ]);
    expect(runs(item(completed(full), 'deposit_return'))).toEqual([
      'subheading',
      'text',
      'note',
      'bullet*2',
      'source',
    ]);
    expect(runs(item(completed(full), 'deposit_interest'))).toEqual([
      'subheading',
      'text',
      'note*2',
      'text',
      'bullet*4',
      'text',
      'bullet*4',
      'source*2',
    ]);
    expect(runs(item(completed(unknownLargeLandlord), 'rent_update'))).toEqual([
      'subheading',
      'text',
      'note*2',
      'text',
      'row*5',
      'bullet*2',
      'text',
      'row*7',
      'bullet*9',
      'source*4',
    ]);
  });

  it('gives each piece of information as a title, its text and its sources', () => {
    const all = lines(completed(contract()));
    const info = all.slice(
      all.indexOf('heading: client.rental.report.information') + 1,
      all.indexOf('heading: client.rental.report.unchecked'),
    );
    expect(info.filter((l) => l.startsWith('subheading: '))).toEqual(
      [
        'reference_price',
        'minimum_term',
        'notice_windows',
        'deposit_lodging',
        'regional_rules',
        'meters',
      ].map((k) => `subheading: client.rental.info.${k}.title`),
    );
    expect(runs(info)).toEqual([
      ...['subheading', 'text', 'source*2'],
      ...Array<string[]>(5).fill(['subheading', 'text', 'source']).flat(),
    ]);
  });

  it('lists what it does not check', () => {
    const all = lines(completed(contract()));
    expect(all.slice(all.indexOf('heading: client.rental.report.unchecked') + 1)).toEqual(
      ['initial_rent_cap', 'regional_rules', 'extensions', 'damage', 'later_agreements'].map(
        (k) => `bullet: client.rental.unchecked.${k}`,
      ),
    );
  });
});
