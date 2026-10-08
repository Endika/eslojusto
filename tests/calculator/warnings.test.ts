// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { calculatorAnalytics } from '../../src/analytics/calculator';
import type { Track } from '../../src/analytics/events';
import { applyConditions } from '../../src/calculator/conditions';
import { formEntries } from '../../src/calculator/fill';
import { readForm, readSituations } from '../../src/calculator/form';
import { warnings, renderResult, type Warning, type ResultData } from '../../src/calculator/render';
import { reviewFinalPay } from '../../src/engine/review';
import {
  PROTECTED_SITUATIONS,
  type Cause,
  type FinalPayInput,
  type ProtectedSituation,
} from '../../src/engine/types';
import { estimateBenefit } from '../../src/engine/unemployment';
import { today, tr } from '../documents/fixtures';

const DISMISSALS =
  'objective_dismissal collective_dismissal unfair_dismissal disciplinary_dismissal';

// The answers this feature adds, as the form writes them, around the questions every review needs.
function form(cause: Cause, extra = ''): HTMLFormElement {
  const f = document.createElement('form');
  f.innerHTML = `
    <input type="radio" name="cause" value="${cause}" checked>
    <input name="startDate" value="2020-01-01"><input name="endDate" value="2026-08-31">
    <input name="extraPayProrated" value="yes"><input name="monthlySalary" value="1000">
    <input name="extraPayCount" value="2"><input name="holidayUnit" value="calendar">
    <input name="annualHolidayDays" value="30"><input name="holidayDaysTaken" value="0">
    <div data-if-cause="${DISMISSALS} unknown" hidden>
      <input type="radio" name="situations" value="no">
      <input type="radio" name="situations" value="yes" checked>
      <div data-if-situations="yes" hidden>
        ${PROTECTED_SITUATIONS.map(
          (s) => `<input type="checkbox" name="situation_${s}" value="yes" checked>`,
        ).join('')}
      </div>
    </div>
    <fieldset data-if-cause="${DISMISSALS}" hidden>
      <input type="radio" name="erte" value="none">
      <input type="radio" name="erte" value="reduced" checked>
      <div data-if-erte="reduced suspended" hidden>
        <input name="preErteMonthlySalary" value="2000">
      </div>
    </fieldset>
    <input type="radio" name="paid" value="yes"><input type="radio" name="paid" value="no" checked>
    ${extra}`;
  document.body.replaceChildren(f);
  applyConditions(f);
  return f;
}

const input = (f: HTMLFormElement): FinalPayInput => {
  const r = readForm(f);
  if ('errors' in r) throw new Error(JSON.stringify(r.errors));
  return r.input;
};

describe('the new answers on the form', () => {
  it('after a dismissal: the ERTE, its salary from before and whether it was paid', () => {
    const e = input(form('unfair_dismissal'));
    expect(e).toMatchObject({ erte: 'reduced', preErteMonthlySalary: 2000, paid: false });
  });

  it('a resignation asks neither the ERTE nor the situations', () => {
    const f = form('resignation');
    expect(input(f).erte).toBeUndefined();
    expect(input(f).preErteMonthlySalary).toBeUndefined();
    expect(readSituations(f)).toEqual([]);
  });

  it('the salary from before only with a reduction or a suspension', () => {
    const f = form('objective_dismissal');
    const none = f.querySelector<HTMLInputElement>('[name="erte"][value="none"]');
    if (none) none.checked = true;
    applyConditions(f);
    expect(input(f).erte).toBe('none');
    expect(input(f).preErteMonthlySalary).toBeUndefined();
  });

  it('«No» leaves out any situation still ticked', () => {
    const f = form('unfair_dismissal');
    const no = f.querySelector<HTMLInputElement>('[name="situations"][value="no"]');
    if (no) no.checked = true;
    applyConditions(f);
    expect(readSituations(f)).toEqual([]);
  });

  it('the situations are read apart: never in the input the engine and the events get', () => {
    const f = form('unknown');
    expect(readSituations(f)).toEqual(PROTECTED_SITUATIONS);
    const e = input(f);
    expect(JSON.stringify(e)).not.toMatch(/situation|pregnan|sick|leave|violence/);
  });
});

describe('the situations of a possibly null dismissal never leave the page', () => {
  it('no event carries them, nor their names: only the form keeps them', () => {
    const f = form('objective_dismissal');
    const e = input(f);
    const r = reviewFinalPay(e, {}, today);
    if (!r.ok) throw new Error('invalid input');
    const sent: unknown[] = [];
    const track: Track = (event, props) => void sent.push({ event, props });
    const events = calculatorAnalytics(track, () => 0);
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1)
        f.querySelector<HTMLInputElement>('[name="situation_sick_leave"]')?.click();
      events.fieldRejected('fechas', 'endDate');
      events.reviewCompleted({
        review: r.review,
        input: input(f),
        figures: {},
        benefit: estimateBenefit(e, 0),
        otherContracts: 0,
        detail: 'unlocked',
      });
    }
    expect(sent.map((s) => (s as { event: string }).event)).toContain('review_completed');
    expect(JSON.stringify(sent)).not.toMatch(
      /situation|pregnan|family_leave|back_from|care_rights|violence|sick/,
    );
    expect(formEntries(f)).toContainEqual(['situation_pregnancy', 'yes']);
  });
});

const result = (o: Partial<FinalPayInput>, extra: Partial<ResultData> = {}): ResultData => {
  const e: FinalPayInput = {
    cause: 'unfair_dismissal',
    startDate: { y: 2020, m: 1, d: 1 },
    endDate: { y: 2026, m: 8, d: 31 },
    monthlySalary: 3000,
    extraPayProrated: true,
    extraPayCount: 2,
    extraPayAmount: 0,
    extraPayAccrual: 'unknown',
    holidayUnit: 'calendar',
    annualHolidayDays: 30,
    holidayDaysTaken: 0,
    ...o,
  };
  const r = reviewFinalPay(e, {}, today);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return {
    review: r.review,
    benefit: estimateBenefit(e, 0),
    cause: e.cause,
    children: 0,
    erte: e.erte,
    ...extra,
  };
};

// Amounts carry a no-break space before the euro sign.
const textOf = (n: Warning) =>
  n.lines.map((line) =>
    line
      .map((p) => (typeof p === 'string' ? p : p.textContent))
      .join('')
      .replace(/\s/g, ' '),
  );
const find = (list: Warning[], id: Warning['id']) => list.find((n) => n.id === id);
const situations = (...s: ProtectedSituation[]) => ({ situations: s });

describe('the null dismissal warning', () => {
  it('for a case of art. 55.5: «podría ser nulo», readmission, the 20 working days, no figure', () => {
    const n = find(warnings(result({}, situations('pregnancy')), false, tr), 'null_dismissal');
    const text = n ? textOf(n) : [];
    expect(text).toEqual([
      'Por lo que has marcado, el despido podría ser nulo (art. 55.5 ET), salvo que el motivo no tenga nada que ver con esa situación.',
      'Si un juzgado lo declarase nulo, la empresa tendría que readmitirte y pagarte los salarios que dejaste de cobrar (arts. 55.6 y 53.4 ET). Esta revisión no calcula cifras para ese caso.',
      'Para impugnar el despido hay 20 días hábiles desde la fecha de baja (art. 59.3 ET); presentar la papeleta de conciliación interrumpe el plazo. Consulta a un abogado laboralista o a un sindicato antes de que pasen.',
    ]);
    expect(n?.sources.map((s) => s.id)).toEqual(['et55_5', 'et53', 'et59']);
    expect(n?.calculation).toBeNull();
    expect(text.join(' ')).not.toMatch(/\d+(,\d+)? €/);
  });

  it('a sick leave alone: the weaker wording of Ley 15/2022, not art. 55.5', () => {
    const n = find(warnings(result({}, situations('sick_leave')), false, tr), 'null_dismissal');
    const text = n ? textOf(n).join(' ') : '';
    expect(text).toContain('Ley 15/2022');
    expect(text).toContain('Los tribunales todavía no lo aplican de forma uniforme.');
    expect(text).not.toContain('art. 55.5');
    expect(n?.sources.map((s) => s.id)).toContain('ley15_2022');
  });

  it.each(PROTECTED_SITUATIONS)('%s never reads «es nulo»', (s) => {
    const n = find(warnings(result({}, situations(s)), false, tr), 'null_dismissal');
    expect(n).toBeDefined();
    expect(n ? textOf(n).join(' ') : '').not.toMatch(/\bes nulo\b/);
  });

  it('nothing ticked, or a cause that is not a dismissal: no warning', () => {
    expect(find(warnings(result({}), false, tr), 'null_dismissal')).toBeUndefined();
    const resignation = result({ cause: 'resignation' }, situations('pregnancy'));
    expect(find(warnings(resignation, false, tr), 'null_dismissal')).toBeUndefined();
  });

  it('shows with the summary and with the detail alike', () => {
    const d = result({}, situations('pregnancy'));
    expect(warnings(d, true, tr)).toEqual(warnings(d, false, tr));
  });
});

describe('the other warnings', () => {
  it('a cause not known: only what does not depend on it is reviewed', () => {
    const n = find(warnings(result({ cause: 'unknown' }), true, tr), 'cause_unknown');
    expect(n ? textOf(n)[0] : '').toContain('La indemnización no se calcula.');
  });

  it('an ERTE not known: the full salary from before, as a warning only', () => {
    const n = find(warnings(result({ erte: 'unknown' }), true, tr), 'erte_unknown');
    expect(n ? textOf(n)[0] : '').toContain('STS 678/2018');
    expect(find(warnings(result({ erte: 'none' }), true, tr), 'erte_unknown')).toBeUndefined();
  });

  it('unpaid: the interest, the days left to claim it and the other deadline apart', () => {
    const n = find(warnings(result({ paid: false }), false, tr), 'late_interest');
    // 3,000 € since 31 August: 37 days to 7 October.
    expect(n ? textOf(n) : []).toEqual([
      'Lo que es salario lleva un interés por el retraso del 10 % al año (art. 29.3 ET): unos 30 € desde la baja hasta hoy. La indemnización no lo lleva, y las vacaciones no disfrutadas no se suman porque es dudoso que lo lleven.',
      'Para reclamar las cantidades del finiquito hay un año desde la baja (art. 59.1 y 59.2 ET): te quedan 328 días para reclamarlo.',
      'Es un plazo distinto de los 20 días hábiles para impugnar un despido (art. 59.3 ET).',
    ]);
    expect(n?.calculation).toContain('10 % al año × 3.000,00 € × 37 días');
    expect(n?.sources.map((s) => s.id)).toEqual(['et29', 'et59']);
  });

  it('locked, the interest keeps its sentence but not how it is worked out', () => {
    expect(
      find(warnings(result({ paid: false }), true, tr), 'late_interest')?.calculation,
    ).toBeNull();
  });

  it('a year after the termination: it may have lapsed and no interest is counted', () => {
    const n = find(
      warnings(result({ paid: false, endDate: { y: 2025, m: 9, d: 1 } }), false, tr),
      'late_interest',
    );
    expect(n ? textOf(n) : []).toEqual([
      'Ha pasado más de un año desde la baja, así que puede haber prescrito (art. 59.1 y 59.2 ET), salvo que algo interrumpiera el plazo. Por eso no se cuenta el interés.',
      'Es un plazo distinto de los 20 días hábiles para impugnar un despido (art. 59.3 ET).',
    ]);
    expect(n?.calculation).toBeNull();
  });

  it('after a resignation the 20 working days are not mentioned', () => {
    const n = find(
      warnings(result({ cause: 'resignation', paid: false }), false, tr),
      'late_interest',
    );
    expect(n ? textOf(n).join(' ') : '').not.toContain('20 días hábiles');
  });

  it('paid, or not answered: no interest', () => {
    expect(find(warnings(result({ paid: true }), false, tr), 'late_interest')).toBeUndefined();
    expect(find(warnings(result({}), false, tr), 'late_interest')).toBeUndefined();
  });
});

describe('the warnings on the page', () => {
  function page(): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = `
      <section data-summary hidden>
        <p data-summary-headline></p><ul data-summary-lines></ul>
        <p data-summary-counted hidden></p><p data-summary-benefit></p>
        <div data-summary-deadlines></div>
      </section>
      <div data-warnings hidden></div>
      <div data-items></div>
      <ul data-unchecked></ul>
      <template data-template="warning">
        <section data-warning>
          <span data-warning-tab></span><h3 data-warning-title></h3><div data-warning-lines></div>
          <details data-warning-detail><p data-warning-calculation></p><ul data-warning-sources></ul></details>
        </section>
      </template>
      <template data-template="source"><li><a></a><span data-in-force hidden></span></li></template>`;
    return div;
  }

  it('render beside the summary, titled, with their sources', () => {
    const root = page();
    renderResult(root, result({ paid: false }, situations('pregnancy')), true, tr);
    const box = root.querySelector<HTMLElement>('[data-warnings]');
    expect(box?.hidden).toBe(false);
    const titles = [...root.querySelectorAll('[data-warning-title]')].map((h) => h.textContent);
    expect(titles).toEqual(['Este despido podría ser nulo', 'Si aún no te han pagado']);
    const nullNotice = root.querySelector('[data-warning="null_dismissal"]');
    expect(nullNotice?.getAttribute('aria-labelledby')).toBe('warning-null_dismissal');
    expect(nullNotice?.querySelectorAll('[data-warning-sources] li')).toHaveLength(3);
  });

  it('none: the box stays hidden', () => {
    const root = page();
    renderResult(root, result({}), true, tr);
    expect(root.querySelector<HTMLElement>('[data-warnings]')?.hidden).toBe(true);
  });
});
