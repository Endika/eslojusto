import { describe, expect, it } from 'vitest';
import { electricityCase } from '../../src/bills/electricity/case';
import {
  correctedBills,
  correctionLetter,
  electricityLetterKinds,
} from '../../src/bills/electricity/letters';
import type { CompletedElectricityReview } from '../../src/bills/electricity/ports';
import { telecomCase } from '../../src/bills/telecom/case';
import { exitLetter, penaltyLetter, telecomLetterKinds } from '../../src/bills/telecom/letters';
import type { CompletedTelecomReview } from '../../src/bills/telecom/ports';
import { NO_DETAILS, type LetterDetails, type LetterKind } from '../../src/documents/letter';
import { renderPdf } from '../../src/documents/pdf';
import type { Block, DocumentModel } from '../../src/documents/ports';
import { BILLS_SOURCES } from '../../src/engine/bills/data/sources';
import { BILLS_TABLES } from '../../src/engine/bills/data/tables';
import { reviewElectricityBill } from '../../src/engine/bills/electricity-review';
import { findingsOf } from '../../src/engine/bills/finding';
import { reviewTelecom } from '../../src/engine/bills/telecom-review';
import type { ElectricityBillInput, TelecomInput } from '../../src/engine/bills/types';
import { parseDate } from '../../src/engine/date';
import { t } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { FORBIDDEN, forbiddenIn } from '../support/forbidden';
import { freeBill, juneBill, meter, telecom, TODAY } from '../engine/bills/input';
import { NORMS_BEFORE_FIGURE } from '../engine/bills/norms-before-figure';

const tr: Translate = (key, vars) => t('es', key, vars);

const electricity = (input: ElectricityBillInput): CompletedElectricityReview => {
  const r = reviewElectricityBill(input, TODAY, {
    norms: NORMS_BEFORE_FIGURE,
    tables: BILLS_TABLES,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { input, review: r.review };
};

const exit = (input: TelecomInput): CompletedTelecomReview => {
  const r = reviewTelecom(input, TODAY, {
    norms: NORMS_BEFORE_FIGURE,
    sources: BILLS_SOURCES,
    tables: { holidays: BILLS_TABLES.holidays },
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return { input, review: r.review };
};

// The figures' narrow and hard spaces, and the hyphens that keep a date whole, read as plain ones.
const text = (model: DocumentModel) =>
  model.blocks
    .map((b: Block) =>
      'text' in b
        ? b.text
        : 'label' in b
          ? `${b.label} ${'value' in b ? (b.value ?? '') : ''}`
          : '',
    )
    .join('\n')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replaceAll('\u2011', '-');

const DETAILS: LetterDetails = {
  ...NO_DETAILS,
  name: 'Alex Ejemplo',
  company: 'Comercializadora Ficticia, S.A.',
  reference: 'CT-0000-TEST',
  place: 'Teruel',
  date: parseDate('2026-10-13'),
};

// The June bill with its meter charged at 1,00 € instead of 0,80 €; VAT on 50,42 € at 21 % is
// 10,59 €.
const meterOver = (change: Partial<ElectricityBillInput> = {}) =>
  electricity(
    juneBill({
      meter: meter({ amount: 1 }),
      vat: { base: 50.42, percent: 21, amount: 10.59 },
      total: 61.01,
      ...change,
    }),
  );

// A free-market bill with a maintenance service the person does not know whether they asked for
// and an insurance they did not ask for. Its power terms are the offer's own, so its taxes come
// out short on the tax base the review works out.
const withServices = electricity(
  freeBill({
    supplyFingerprint: 'aaaaaaaaaaaaaaaa',
    services: [
      { label: 'maintenance', amount: 5, requested: 'unknown' },
      { label: 'insurance', amount: 3, requested: 'no' },
    ],
  }),
);

// The June bill falling due in November 2026: VAT at 10 % or 21 % until the CPI figure and the
// validation are in. At 21 % it matches; the 10 % reading has it 5,44 € over.
const vatUnsettled = electricity(
  juneBill({ dueOn: parseDate('2026-11-10'), supplyFingerprint: 'bbbbbbbbbbbbbbbb' }),
);

describe('which electricity letters a year offers', () => {
  it('offers the correction letter, paid, only with a line over the norm in every reading', () => {
    expect(electricityLetterKinds([meterOver()])).toEqual(['bill_correction']);
    expect(electricityLetterKinds([electricity(juneBill())])).toEqual([]);
    expect(electricityLetterKinds([vatUnsettled])).toEqual([]);
    const c = electricityCase([meterOver()], NORMS_BEFORE_FIGURE);
    expect(c.letterKinds).toEqual(['bill_correction']);
    expect(c.freeLetterKinds).toEqual([]);
    expect(c.filename?.('letter', 'bill_correction')).toBe(
      'client.bills.letter.correction.filename',
    );
    expect(c.filename?.('report')).toBe('client.bills.electricity.report.filename');
  });

  it('never builds a letter the year does not offer', () => {
    const c = electricityCase([electricity(juneBill())], NORMS_BEFORE_FIGURE);
    expect(() => c.letter('bill_correction', NO_DETAILS, tr)).toThrow();
  });
});

describe('the correction letter', () => {
  it('gives each line with what was billed, what the norm sets and the difference', () => {
    const all = text(correctionLetter([meterOver()], NORMS_BEFORE_FIGURE, DETAILS, tr));
    expect(all).toContain('Petición de factura rectificativa');
    expect(all).toContain('Factura del 31-05-2026 al 30-06-2026');
    expect(all).toContain(
      'Alquiler del contador: facturado, 1,00 €; lo que fija la norma, 0,80 €; diferencia, 0,20 €.',
    );
    expect(all).toContain('Comercializadora Comercializadora Ficticia, S.A.');
    expect(all).toContain('Número de contrato CT-0000-TEST');
    expect(all).toContain('factura rectificativa de cada factura');
  });

  it('says what art. 45.2 says of amounts billed over, and links the decree', () => {
    const model = correctionLetter([meterOver()], NORMS_BEFORE_FIGURE, DETAILS, tr);
    expect(text(model)).toContain(
      'El art. 45.2 del Reglamento que aprueba el Real Decreto 88/2026 dice que, si el comercializador ha facturado cantidades superiores a las debidas, en relación con la energía o con el acceso a las redes, deben devolverse todas las cantidades indebidamente facturadas en la primera facturación siguiente, sin fraccionarlas, con los intereses del tipo de interés legal del dinero más 150 puntos básicos.',
    );
    expect(model.blocks).toContainEqual(
      expect.objectContaining({
        type: 'source',
        url: 'https://www.boe.es/buscar/act.php?id=BOE-A-2026-3212',
      }),
    );
  });

  it('lists every bill of the year that counts, a copy once, and adds up the differences', () => {
    const july = meterOver({
      readingFrom: parseDate('2026-06-30'),
      readingTo: parseDate('2026-07-30'),
    });
    const model = correctionLetter(
      [meterOver(), july, meterOver()],
      NORMS_BEFORE_FIGURE,
      DETAILS,
      tr,
    );
    const all = text(model);
    expect(model.title).toBe('Petición de facturas rectificativas');
    expect(all).toContain('Te escribo por 2 facturas de la luz');
    expect(all.match(/Factura del 31-05-2026 al 30-06-2026/g)).toHaveLength(1);
    expect(all).toContain('Factura del 30-06-2026 al 30-07-2026');
    expect(all).toContain('En total, las diferencias suman 0,40 €.');
  });

  it('carries no line to look at, none charged short and none whose lowest reading is nothing', () => {
    // Three supplies billed for the same days.
    const year = [withServices, vatUnsettled, meterOver({ supplyFingerprint: 'cccccccccccccccc' })];
    // Each of those lines is in the reviews, so leaving them out is the letter's doing.
    const findings = year.flatMap((e) => e.review.items.flatMap(findingsOf));
    expect(findings.map((f) => `${f.id}:${f.status}`)).toContain('service:review_it');
    expect(findings.some((f) => f.id === 'vat' && f.direction === 'under')).toBe(true);
    expect(year[1]?.review.items.some((i) => i.kind === 'readings')).toBe(true);

    const lines = correctedBills(year).flatMap((b) => b.lines.map((l) => l.finding));
    expect(lines.map((f) => `${f.id}:${f.status}`)).toEqual([
      'service:paid_over',
      'meter:above_regulated_price',
    ]);
    for (const f of lines) {
      expect(f.direction).toBe('over');
      expect(f.pendingOn).toEqual([]);
    }
    const all = text(correctionLetter(year, NORMS_BEFORE_FIGURE, DETAILS, tr));
    expect(all).toContain('Servicio aparte de la luz · Seguro: facturado, 3,00 €');
    expect(all).not.toContain('Mantenimiento');
    expect(all).not.toContain('IVA');
    expect(all).not.toMatch(/Revísalo|de menos|sin sumar/);
  });
});

describe('which telecom letters an exit offers', () => {
  // A price rise notified on 01-02-2026, in force from 10-03-2026, and an exit asked for on
  // 20-02-2026, within the month: no penalty but the handset kept.
  const afterChange = (change: Partial<TelecomInput> = {}) =>
    telecom({
      exitRequestedOn: parseDate('2026-02-20'),
      penaltyCharged: 120,
      changeNotice: {
        sentOn: parseDate('2026-02-01'),
        appliesOn: parseDate('2026-03-10'),
        change: 'price_up',
        index: 'none',
      },
      ...change,
    });

  it('offers the exit letter free after a change, and the penalty letter with figures for the pass', () => {
    expect(telecomLetterKinds(exit(afterChange()))).toEqual({
      paid: [],
      free: ['telecom_exit_without_penalty'],
    });
    // 184 of 549 days left of 180,00 € allow 60,33 €: 120,00 € is 59,67 € over.
    expect(telecomLetterKinds(exit(telecom({ penaltyCharged: 120 })))).toEqual({
      paid: ['telecom_penalty_review'],
      free: [],
    });
    expect(telecomLetterKinds(exit(telecom({ penaltyCharged: 60 })))).toEqual({
      paid: [],
      free: [],
    });
  });

  it('offers no exit letter for a change the review sends to look at', () => {
    expect(
      telecomLetterKinds(
        exit(
          afterChange({
            changeNotice: {
              sentOn: parseDate('2026-02-01'),
              appliesOn: null,
              change: 'other',
              index: 'none',
            },
          }),
        ),
      ).free,
    ).toEqual([]);
    expect(
      telecomLetterKinds(
        exit(
          afterChange({
            changeNotice: {
              sentOn: parseDate('2026-02-01'),
              appliesOn: null,
              change: 'price_up',
              index: 'ipc',
            },
          }),
        ),
      ).free,
    ).toEqual([]);
  });

  it('gives the dates, art. 67.8 and the handset kept, with no amount', () => {
    const r = exit(afterChange({ handset: { value: 300, kept: true } }));
    const model = exitLetter(r, DETAILS, tr);
    const all = text(model);
    expect(model.title).toBe('Baja tras un cambio de condiciones');
    expect(all).toContain(
      'El 01-02-2026 me comunicaste un cambio en las condiciones de mi contrato, que se aplicaba desde el 10-03-2026.',
    );
    expect(all).toContain(
      'El 20-02-2026 pedí la baja, dentro del mes siguiente a esa comunicación.',
    );
    expect(all).toContain(
      'El art. 67.8 de la Ley 11/2022, General de Telecomunicaciones, recoge el derecho a rescindir el contrato sin contraer ningún coste adicional',
    );
    expect(all).toContain('en el plazo de un mes a partir de la comunicación');
    expect(all).toContain('Conservo el terminal subvencionado');
    expect(all).toContain('art. 67.10');
    expect(all).toContain('cómo calculas lo que corresponde al terminal que conservo');
    expect(all).not.toMatch(/€|\d+,\d\d/);
    expect(model.blocks).toContainEqual(
      expect.objectContaining({ type: 'source', text: expect.stringContaining('art. 67.8') }),
    );
  });

  it('says a handset given back without the handset sentences of 67.10', () => {
    const all = text(
      exitLetter(exit(afterChange({ handset: { value: 300, kept: false } })), DETAILS, tr),
    );
    expect(all).toContain('No conservo el terminal que venía con el contrato.');
    expect(all).not.toContain('art. 67.10');
    expect(all).toContain('Te pido que revises la penalización que me has cobrado por esta baja.');
  });

  it('gives the days served and left, art. 62.5, the cap and the difference', () => {
    const all = text(penaltyLetter(exit(telecom({ penaltyCharged: 120 })), DETAILS, tr));
    expect(all).toContain(
      'Mi contrato tenía una permanencia de 18 meses desde el 01-03-2025, hasta el 01-09-2026, con una penalización pactada de 180,00 €. El 01-03-2026 pedí la baja: había cumplido 365 días de permanencia y quedaban 184 días. Me cobraste 120,00 € de penalización.',
    );
    expect(all).toContain(
      'será proporcional al número de días no efectivos del compromiso de permanencia acordado',
    );
    expect(all).toContain(
      'En proporción a los 184 días que quedaban de 549 días, la penalización llega a 60,33 €; la cobrada pasa de esa cifra en 59,67 €.',
    );
  });

  it('builds both through the pass, and names each file', () => {
    const c = telecomCase(exit(telecom({ penaltyCharged: 120 })), NORMS_BEFORE_FIGURE);
    expect(c.letter('telecom_penalty_review', NO_DETAILS, tr).title).toBe(
      'Revisión de la penalización por permanencia',
    );
    expect(c.filename?.('letter', 'telecom_penalty_review')).toBe(
      'client.bills.telecom.letter.penalty.filename',
    );
    expect(() => c.letter('telecom_exit_without_penalty', NO_DETAILS, tr)).toThrow();
    const free = telecomCase(exit(afterChange()), NORMS_BEFORE_FIGURE);
    expect(free.freeLetterKinds).toEqual(['telecom_exit_without_penalty']);
    expect(free.filename?.('letter', 'telecom_exit_without_penalty')).toBe(
      'client.bills.telecom.letter.exit.filename',
    );
  });
});

describe('the bills letters', () => {
  const july = meterOver({
    readingFrom: parseDate('2026-06-30'),
    readingTo: parseDate('2026-07-30'),
  });
  const electricityCases = [[meterOver()], [meterOver(), july], [withServices, vatUnsettled]];
  const telecomCases = [
    exit(telecom({ penaltyCharged: 120 })),
    exit(
      telecom({
        exitRequestedOn: parseDate('2026-02-20'),
        penaltyCharged: 400,
        handset: { value: 300, kept: true },
        changeNotice: {
          sentOn: parseDate('2026-02-01'),
          appliesOn: null,
          change: 'service_worse',
          index: 'none',
        },
      }),
    ),
  ];
  const models = [
    ...electricityCases.flatMap((entries) => {
      const c = electricityCase(entries, NORMS_BEFORE_FIGURE);
      return [...c.letterKinds.map((k) => c.letter(k, DETAILS, tr)), c.report(tr, TODAY)];
    }),
    ...telecomCases.flatMap((r) => {
      const c = telecomCase(r, NORMS_BEFORE_FIGURE);
      const kinds: LetterKind[] = [...c.letterKinds, ...(c.freeLetterKinds ?? [])];
      return [...kinds.map((k) => c.letter(k, DETAILS, tr)), c.report(tr, TODAY)];
    }),
  ];

  it('inform without advising, asserting or pressing', () => {
    expect(models.filter((m) => m.footer === null)).toHaveLength(5);
    for (const model of models) expect(forbiddenIn('client.bills.', text(model))).toEqual([]);
  });

  it("end with the person's name and no line to sign on", () => {
    for (const model of models.filter((m) => m.footer === null)) {
      expect(model.blocks.at(-1)).toEqual({
        type: 'blank',
        label: 'Nombre y apellidos',
        value: 'Alex Ejemplo',
        wrap: true,
      });
      for (const forbidden of FORBIDDEN) expect(text(model).toLowerCase()).not.toMatch(forbidden);
    }
  });

  it('draw with the letter fonts', async () => {
    for (const model of models) expect((await renderPdf(model)).length).toBeGreaterThan(1000);
  });
});
