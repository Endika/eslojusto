// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { renderBenefit, renderReview, statusText } from '../../src/calculator/render';
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
    expect(text).toContain('20 días hábiles (art. 59.4 ET)');
    expect(text).toMatch(/la referencia sería \d{1,3}(\.\d{3})*,\d{2}\s€/);
    expect(text).not.toContain('No te corresponde');
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
  it('no reference for an unfair dismissal, whose minimum is already that figure', () => {
    const c = container();
    renderReview(c, review({ cause: 'unfair_dismissal' }), trV);
    expect(c.querySelector<HTMLElement>('[data-item="severance"] [data-reference]')?.hidden).toBe(
      true,
    );
  });
});

describe('readForm: «No lo sé» for the holiday days taken', () => {
  function buildForm(): HTMLFormElement {
    const form = document.createElement('form');
    form.innerHTML = `
      <input name="cause" value="resignation">
      <input name="startDate" value="2022-01-10"><input name="endDate" value="2026-09-15">
      <input name="extraPayProrated" value="yes"><input name="monthlySalary" value="1850">
      <input name="extraPayCount" value="2"><input name="holidayUnit" value="calendar">
      <input name="annualHolidayDays" value="30">
      <input name="holidayDaysTaken" value="" disabled>
      <input name="holidayDaysTakenUnknown" value="yes">`;
    return form;
  }
  it('checked: the engine gets null', () => {
    const r = readForm(buildForm());
    expect('input' in r && r.input.holidayDaysTaken).toBeNull();
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

  const eightMonths = {
    ...objective,
    startDate: { y: 2026, m: 1, d: 1 },
    endDate: { y: 2026, m: 8, d: 31 },
  };
  const rows = [
    { startDate: { y: 2025, m: 3, d: 1 }, endDate: { y: 2025, m: 10, d: 31 } },
    { startDate: { y: 2024, m: 3, d: 1 }, endDate: { y: 2024, m: 10, d: 31 } },
  ];

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
});
