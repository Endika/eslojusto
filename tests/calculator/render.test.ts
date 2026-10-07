// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  durationKey,
  withHolidayNote,
  visibleStatus,
  renderBenefit,
  renderReview,
  statusText,
} from '../../src/calculator/render';
import { sheetErrors, readBenefitSheets, readForm } from '../../src/calculator/form';
import { estimateBenefit, type Children } from '../../src/engine/unemployment';
import type { OtherContracts } from '../../src/engine/types';
import { t } from '../../src/i18n';
import { reviewFinalPay } from '../../src/engine/review';
import type { FinalPayInput } from '../../src/engine/types';

const resignation: FinalPayInput = {
  cause: 'resignation',
  startDate: { y: 2022, m: 1, d: 10 },
  endDate: { y: 2026, m: 9, d: 15 },
  monthlySalary: 1850,
  extraPayProrated: true,
  extraPayCount: 2,
  extraPayAmount: 0,
  extraPayAccrual: 'unknown',
  holidayUnit: 'calendar',
  annualHolidayDays: 30,
  holidayDaysTaken: 0,
};
const today = { y: 2026, m: 10, d: 6 };
const tr = (key: Parameters<typeof t>[1]) => t('es', key);

function severance(figure?: number) {
  const r = reviewFinalPay(resignation, figure === undefined ? {} : { severance: figure }, today);
  if (!r.ok) throw new Error('invalid input');
  const p = r.review.items.find((x) => x.item.id === 'severance');
  if (!p) throw new Error('no severance item');
  return p;
}

describe('severance the law sets at zero', () => {
  it('no employer figure: a neutral status, neither «coincide» nor «no has metido la cifra»', () => {
    const p = severance();
    expect(visibleStatus(p)).toBe('no_severance');
    expect(statusText(p, tr)).toBe('No te corresponde indemnización por ley en este caso');
  });
  it('with an employer figure: a normal comparison', () => {
    expect(visibleStatus(severance(0))).toBe('matches');
    expect(visibleStatus(severance(500))).toBe('above_minimum');
  });
});

const review = (o: Partial<FinalPayInput>, figures = {}) => {
  const r = reviewFinalPay({ ...resignation, ...o }, figures, today);
  if (!r.ok) throw new Error('invalid input');
  return r.review;
};
const trV = (key: Parameters<typeof t>[1], v?: Record<string, string | number>) => t('es', key, v);

describe('zero severance by cause', () => {
  it('disciplinary: conditional, with the reference and the deadline, never stating it is not due', () => {
    const rev = review({ cause: 'disciplinary_dismissal' });
    const p = rev.items.find((x) => x.item.id === 'severance');
    if (!p) throw new Error('no severance');
    const text = statusText(p, trV, rev.unfairReference);
    expect(text).toMatch(/^Si el despido es procedente, no hay indemnización \(art\. 55\.7 ET\)/);
    expect(text).toContain('20 días hábiles (art. 59.3 ET)');
    expect(text).toMatch(/la referencia sería \d{1,3}(\.\d{3})*,\d{2}\s€/);
    expect(text).not.toContain('No te corresponde');
  });
});

describe('unknown holiday days taken', () => {
  it('says what is missing, not the agreement', () => {
    const p = review({ holidayDaysTaken: null }).items.find((x) => x.item.id === 'holiday_pay');
    if (!p) throw new Error('no holiday pay');
    expect(statusText(p, trV)).toBe('No se puede comprobar sin los días que has disfrutado');
  });
});

function container(): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = `
    <div data-items></div><ul data-unchecked></ul>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span>
        <h3 data-title></h3>
        <p><svg data-mark><use></use></svg><span data-status-text></span></p>
        <p data-citation hidden></p>
        <dl data-figures><dt data-range-label></dt><dd data-range></dd><dd data-employer></dd></dl>
        <p data-counted hidden></p>
        <p data-based-on hidden></p>
        <p data-agreement hidden>agreement</p>
        <p data-reference hidden></p>
        <p data-calculation></p>
        <ul data-sources></ul>
      </section>
    </template>
    <template data-template="source">
      <li><a></a><span data-in-force hidden></span></li>
    </template>`;
  return div;
}

describe('renderReview', () => {
  it('the holiday item says the days it counted as taken and their unit', () => {
    const c = container();
    renderReview(
      c,
      review({ holidayUnit: 'working', annualHolidayDays: 22, holidayDaysTaken: 20 }),
      trV,
    );
    const counted = c.querySelector<HTMLElement>('[data-item="holiday_pay"] [data-counted]');
    expect(counted?.hidden).toBe(false);
    expect(counted?.textContent).toBe('Hemos contado 20 días laborables disfrutados de 22 al año.');
    expect(c.querySelector<HTMLElement>('[data-item="severance"] [data-counted]')?.hidden).toBe(
      true,
    );
  });

  it('each source shows the date it came into force', () => {
    const c = container();
    renderReview(c, review({}), trV);
    const holidayPay = c.querySelector('[data-item="holiday_pay"]');
    const inForce = holidayPay?.querySelector<HTMLElement>('[data-in-force]');
    expect(inForce?.hidden).toBe(false);
    expect(inForce?.textContent).toBe('en vigor desde 13-11-2015');
  });

  it('what the agreement may improve carries its note; the rest does not', () => {
    const c = container();
    renderReview(
      c,
      review({ extraPayProrated: false, extraPayAmount: 1850, extraPayAccrual: 'annual' }),
      trV,
    );
    const note = (id: string) =>
      c.querySelector(`[data-item="${id}"] [data-agreement]`) as HTMLElement | null;
    expect(note('holiday_pay')?.hidden).toBe(false);
    expect(note('extra_pay')?.hidden).toBe(false);
    expect(note('pending_salary')?.hidden).toBe(true);
    expect(note('notice_deduction')?.hidden).toBe(true);
  });

  it('disciplinary: the reference goes in the status, not repeated below', () => {
    const c = container();
    renderReview(c, review({ cause: 'disciplinary_dismissal' }), trV);
    const sheet = c.querySelector('[data-item="severance"]');
    expect(sheet?.querySelector('[data-status-text]')?.textContent).toContain('referencia sería');
    expect(sheet?.querySelector<HTMLElement>('[data-reference]')?.hidden).toBe(true);
  });

  it('objective: the unfair reference below, as information, with its figure', () => {
    const c = container();
    renderReview(
      c,
      review({
        cause: 'objective_dismissal',
        startDate: { y: 2024, m: 1, d: 1 },
        endDate: { y: 2026, m: 6, d: 30 },
        monthlySalary: 3000,
        noticeDaysReceived: 15,
      }),
      trV,
    );
    const note = c.querySelector<HTMLElement>('[data-item="severance"] [data-reference]');
    expect(note?.hidden).toBe(false);
    expect(note?.textContent?.replace(/\s/g, ' ')).toBe(
      'Referencia: si un juzgado declarase improcedente el despido, la indemnización sería de 8.136,99 € (33 días de salario por año trabajado, 45 por el tiempo anterior al 12 de febrero de 2012, con sus topes). Es la cifra con la que suelen compararse los acuerdos de mejora.',
    );
  });

  it('no reference for an unfair dismissal, whose minimum is already that figure', () => {
    const c = container();
    renderReview(c, review({ cause: 'unfair_dismissal' }), trV);
    expect(c.querySelector<HTMLElement>('[data-item="severance"] [data-reference]')?.hidden).toBe(
      true,
    );
  });
});

describe('readForm: «No lo sé» for the holiday days taken', () => {
  function buildForm(unknown: boolean): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="cause" value="resignation">
      <input name="startDate" value="2022-01-10"><input name="endDate" value="2026-09-15">
      <input name="extraPayProrated" value="yes"><input name="monthlySalary" value="1850">
      <input name="extraPayCount" value="2"><input name="holidayUnit" value="calendar">
      <input name="annualHolidayDays" value="30">
      <input name="holidayDaysTaken" value="" ${unknown ? 'disabled' : ''}>
      ${unknown ? '<input name="holidayDaysTakenUnknown" value="yes">' : ''}`;
    return form;
  }
  it('checked: the engine gets null', () => {
    const r = readForm(buildForm(true));
    expect('input' in r && r.input.holidayDaysTaken).toBeNull();
  });
  it('unchecked and blank: the value is missing, with no default', () => {
    const r = readForm(buildForm(false));
    expect('errors' in r && r.errors.map((e) => e.field)).toEqual(['holidayDaysTaken']);
  });
});

function benefitSheet(): HTMLElement {
  const div = document.createElement('div');
  div.dataset['review'] = '';
  div.innerHTML = `
    <section data-benefit>
      <p><svg data-benefit-mark><use></use></svg><span data-benefit-status-text></span></p>
      <p data-benefit-reason></p>
      <p data-benefit-no>just cause</p>
      <div data-benefit-yes>
        <p data-benefit-amount></p><p data-benefit-full-time>full time</p>
        <p data-benefit-children-unknown hidden></p><p data-benefit-deduction></p>
        <p data-benefit-duration></p><p data-benefit-duration-note></p><p data-benefit-qualifying></p>
      </div>
      <ul data-benefit-sources></ul>
    </section>
    <template data-template="source">
      <li><a></a><span data-in-force hidden></span></li>
    </template>`;
  const sheet = div.querySelector<HTMLElement>('[data-benefit]');
  if (!sheet) throw new Error('no sheet');
  return sheet;
}

// Objective dismissal, 2,000 € × 12 at 70 % gives 1,400 €, the cap with one child.
const objective: FinalPayInput = {
  ...resignation,
  cause: 'objective_dismissal',
  monthlySalary: 2000,
};

function benefit(e: FinalPayInput, children: Children, others?: OtherContracts) {
  const sheet = benefitSheet();
  renderBenefit(sheet, estimateBenefit(e, children, others), e.cause, children, trV);
  const text = (sel: string) => sheet.querySelector(sel)?.textContent?.replace(/\s/g, ' ') ?? '';
  const hidden = (sel: string) => sheet.querySelector<HTMLElement>(sel)?.hidden;
  return { sheet, text, hidden };
}

describe('renderBenefit', () => {
  it('objective dismissal with one child: whole-euro figures, «al menos» and its article', () => {
    const { sheet, text, hidden } = benefit(objective, 1);
    expect(sheet.dataset['state']).toBe('with_figures');
    expect(text('[data-benefit-status-text]')).toBe(
      'Esta causa da derecho a paro si cumples el resto de requisitos',
    );
    expect(text('[data-benefit-reason]')).toContain('(art. 267.1.a.4.º LGSS)');
    expect(text('[data-benefit-amount]')).toBe(
      'Serían unos 1.400 € al mes los primeros 6 meses y unos 1.200 € después, en bruto.',
    );
    expect(text('[data-benefit-deduction]')).toMatch(/^De ahí se descuentan unos 97 € al mes/);
    expect(text('[data-benefit-duration]')).toMatch(
      /^Al menos unos 540 días \(18 meses\) solo por este trabajo\./,
    );
    expect(text('[data-benefit-qualifying]')).toMatch(/^Solo con este contrato ya tienes los 360/);
    expect(hidden('[data-benefit-no]')).toBe(true);
    expect(hidden('[data-benefit-children-unknown]')).toBe(true);
    expect(sheet.querySelector('[data-benefit-sources] [data-in-force]')?.textContent).toMatch(
      /^en vigor desde \d{2}-\d{2}-\d{4}$/,
    );
  });

  it('children not given: the range from the no-children cap to the 2-or-more cap', () => {
    const high = { ...objective, monthlySalary: 3000 };
    const { text, hidden } = benefit(high, null);
    expect(text('[data-benefit-amount]')).toBe(
      'Serían entre 1.225 € y 1.575 € al mes los primeros 6 meses y entre 1.225 € y 1.575 € después, en bruto.',
    );
    expect(hidden('[data-benefit-children-unknown]')).toBe(false);
  });

  it('resignation: not entitled, with the just cause and no figures', () => {
    const { sheet, text, hidden } = benefit(resignation, null);
    expect(sheet.dataset['state']).toBe('not_applicable');
    expect(text('[data-benefit-status-text]')).toBe('No da derecho a paro');
    expect(text('[data-benefit-reason]')).toContain('(art. 267.2.a LGSS)');
    expect(hidden('[data-benefit-no]')).toBe(false);
    expect(hidden('[data-benefit-yes]')).toBe(true);
  });

  it('under 180 days: no figures and «depende de tus últimas nóminas»', () => {
    const shortContract = { ...objective, startDate: { y: 2026, m: 5, d: 1 } };
    const { sheet, text, hidden } = benefit(shortContract, 0);
    expect(sheet.dataset['state']).toBe('no_figures');
    expect(text('[data-benefit-amount]')).toMatch(/^Depende de tus últimas nóminas/);
    expect(text('[data-benefit-amount]')).not.toMatch(/€/);
    expect(hidden('[data-benefit-deduction]')).toBe(true);
    expect(text('[data-benefit-duration]')).toMatch(/^Depende de lo que hayas cotizado/);
    expect(text('[data-benefit-qualifying]')).toMatch(/^Con este contrato llevas 138 días/);
  });

  const eightMonths = {
    ...objective,
    startDate: { y: 2026, m: 1, d: 1 },
    endDate: { y: 2026, m: 8, d: 31 },
  };
  const rows = [
    { startDate: { y: 2025, m: 3, d: 1 }, endDate: { y: 2025, m: 10, d: 31 } },
    { startDate: { y: 2024, m: 3, d: 1 }, endDate: { y: 2024, m: 10, d: 31 } },
  ];

  it('other contracts with no benefit since: «unos D días», never «exactamente»', () => {
    const { text } = benefit(eightMonths, 0, { contracts: rows, benefitDrawnSince: false });
    expect(text('[data-benefit-duration]')).toBe(
      'Unos 240 días (8 meses), con las fechas que has puesto.',
    );
    expect(text('[data-benefit-qualifying]')).toMatch(/sumas 733 días cotizados/);
    expect(text('[data-benefit-duration-note]')).toContain('art. 269.4 LGSS');
  });

  it('other contracts with «No lo sé»: «hasta unos D días» with the reason', () => {
    const { text } = benefit(eightMonths, 0, { contracts: rows, benefitDrawnSince: null });
    expect(text('[data-benefit-duration]')).toBe(
      'Hasta unos 240 días (8 meses); si cobraste paro después de alguno de estos contratos, esos días ya se usaron y puede ser menos (art. 269.2 LGSS).',
    );
    expect(text('[data-benefit-qualifying]')).toMatch(/que no hayas usado ya para otro paro/);
  });

  it('«hasta» 0 days never reads «hasta 0 días»', () => {
    const { text, hidden } = benefit(eightMonths, 0, {
      contracts: rows.slice(0, 1),
      benefitDrawnSince: true,
    });
    expect(text('[data-benefit-duration]')).toMatch(/^Hasta unos 120 días/);
    const alone = benefit({ ...eightMonths, startDate: { y: 2026, m: 6, d: 1 } }, 0, {
      contracts: [{ startDate: { y: 2026, m: 1, d: 1 }, endDate: { y: 2026, m: 1, d: 31 } }],
      benefitDrawnSince: true,
    });
    expect(alone.text('[data-benefit-duration]')).toMatch(/^Depende de lo que hayas cotizado/);
    expect(alone.text('[data-benefit-duration]')).not.toMatch(/hasta unos 0/i);
    expect(hidden('[data-benefit-duration-note]')).toBe(true);
    expect(alone.hidden('[data-benefit-duration-note]')).toBe(true);
  });

  it('no benefit sentence gives advice or promises an exact figure', () => {
    for (const [e, h, o] of [
      [objective, 1, undefined],
      [resignation, null, undefined],
      [eightMonths, null, { contracts: rows, benefitDrawnSince: null }],
      [eightMonths, 2, { contracts: rows, benefitDrawnSince: false }],
    ] as const) {
      const t = benefit(e, h, o).sheet.textContent ?? '';
      expect(t).not.toMatch(/exactamente|tienes derecho a paro|\bfirma|\breclama|\bdemanda\b/i);
    }
  });
});

describe('the duration sentence', () => {
  it('720 days is the maximum: neither «al menos» nor the «algo más» note', () => {
    for (const kind of ['at_least', 'exact'] as const) {
      expect(durationKey({ kind, days: 720 })).toBe('client.unemployment.duration.maximum');
      expect(withHolidayNote({ kind, days: 720 })).toBe(false);
    }
    expect(trV('client.unemployment.duration.maximum', { dias: '720', meses: '24' })).toBe(
      'Unos 720 días (24 meses), el máximo.',
    );
  });
  it('«hasta» keeps its caveat and carries no «algo más» note', () => {
    const to = { kind: 'up_to', days: 720, reason: '' } as const;
    expect(durationKey(to)).toBe('client.unemployment.duration.up_to');
    expect(withHolidayNote(to)).toBe(false);
    expect(trV('client.unemployment.duration.up_to')).not.toContain('algo más');
  });
  it('below the maximum, «al menos» and «unos» carry the note; 0 days, «depende»', () => {
    expect(durationKey({ kind: 'at_least', days: 540 })).toBe(
      'client.unemployment.duration.at_least',
    );
    expect(withHolidayNote({ kind: 'at_least', days: 540 })).toBe(true);
    expect(withHolidayNote({ kind: 'exact', days: 240 })).toBe(true);
    expect(durationKey({ kind: 'exact', days: 0 })).toBe('client.unemployment.duration.depends');
  });
});

describe('part-time', () => {
  it('800 €/month: no figures and no deduction, with the minimum base reason', () => {
    const { sheet, text, hidden } = benefit({ ...objective, monthlySalary: 800 }, 1);
    expect(sheet.dataset['state']).toBe('no_figures');
    expect(text('[data-benefit-amount]')).toBe(
      'Con este salario no podemos estimar la cuantía (puede ser jornada parcial); depende de tus bases de cotización.',
    );
    expect(hidden('[data-benefit-deduction]')).toBe(true);
    expect(hidden('[data-benefit-full-time]')).toBe(true);
  });
  it('with figures, the full-time line does show', () => {
    expect(benefit(objective, 1).hidden('[data-benefit-full-time]')).toBe(false);
  });
});

describe('the benefit sheets', () => {
  function buildForm(extra: string): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="cause" value="objective_dismissal">
      <input name="startDate" value="2026-01-01"><input name="endDate" value="2026-08-31">
      <input name="extraPayProrated" value="yes"><input name="monthlySalary" value="2000">
      <input name="extraPayCount" value="2"><input name="holidayUnit" value="calendar">
      <input name="annualHolidayDays" value="30">
      <input name="holidayDaysTaken" value="0">
      <ol>
        <li data-other-contract="0">
          <input name="otherContracts.0.startDate" value="2025-03-01">
          <input name="otherContracts.0.endDate" value="2025-10-31">
        </li>
        <li data-other-contract="1">
          <input name="otherContracts.1.startDate" value="2025-03-01">
          <input name="otherContracts.1.endDate" value="2026-12-31">
        </li>
      </ol>
      ${extra}`;
    return form;
  }

  it('unanswered children is an error on its sheet; «Prefiero no decirlo» is fine', () => {
    expect(sheetErrors(buildForm(''), 'hijos', today)).toEqual([
      { field: 'children', code: 'missing_children' },
    ]);
    const notSaid = buildForm(
      '<input name="children" value="not_said"><input name="otherContracts" value="no">',
    );
    expect(sheetErrors(notSaid, 'hijos', today)).toEqual([]);
    expect(readBenefitSheets(notSaid)).toEqual({
      data: { children: null, others: { contracts: [], benefitDrawnSince: null } },
    });
  });

  it('each row error goes to its row', () => {
    const f = buildForm(
      '<input name="otherContracts" value="yes"><input name="benefitDrawnSince" value="no">',
    );
    expect(sheetErrors(f, 'otros', today)).toEqual([
      { field: 'otherContracts.1.endDate', code: 'other_contract_ends_after_this_one' },
    ]);
  });

  it('with «No» the rows do not count; with a cause without benefit, there is no benefit data', () => {
    const f = buildForm(
      '<input name="children" value="1"><input name="otherContracts" value="no">',
    );
    expect(readBenefitSheets(f)).toEqual({
      data: { children: 1, others: { contracts: [], benefitDrawnSince: null } },
    });
    const cause = f.querySelector<HTMLInputElement>('[name="cause"]');
    if (cause) cause.value = 'resignation';
    expect(readBenefitSheets(f)).toEqual({ data: null });
  });

  it('with «Sí» the benefit-since question must be answered', () => {
    const f = buildForm('<input name="otherContracts" value="yes">');
    expect(sheetErrors(f, 'otros', today).map((e) => e.code)).toContain(
      'missing_benefitDrawnSince',
    );
  });

  it('the engine error goes back to its row even when an earlier row cannot be read', () => {
    const f = buildForm(
      '<input name="otherContracts" value="yes"><input name="benefitDrawnSince" value="no">',
    );
    const start0 = f.querySelector<HTMLInputElement>('[name="otherContracts.0.startDate"]');
    if (start0) start0.value = '';
    expect(sheetErrors(f, 'otros', today)).toEqual([
      { field: 'otherContracts.0.startDate', code: 'missing_value' },
      { field: 'otherContracts.1.endDate', code: 'other_contract_ends_after_this_one' },
    ]);
  });

  it('errors follow the screen order: the question, then each row', () => {
    const f = buildForm('<input name="otherContracts" value="yes">');
    const end0 = f.querySelector<HTMLInputElement>('[name="otherContracts.0.endDate"]');
    if (end0) end0.value = '';
    expect(sheetErrors(f, 'otros', today).map((e) => e.field)).toEqual([
      'benefitDrawnSince',
      'otherContracts.0.endDate',
      'otherContracts.1.endDate',
    ]);
  });
});
