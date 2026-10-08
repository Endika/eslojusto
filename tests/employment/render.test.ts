// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../src/engine/date';
import type { EmploymentPhrase } from '../../src/engine/employment/calculation';
import { everyAssessed } from '../../src/engine/employment/review';
import type { EmploymentInput } from '../../src/engine/employment/types';
import { phraseText, renderEmploymentResult, renderOutOfScope } from '../../src/employment/render';
import {
  belowMinimum,
  contract,
  corners,
  review,
  shortDayRate,
  shortDayRateDoubt,
  tr,
  unknownComplement,
  workOrService,
} from './fixtures';

// The result's hooks and templates, as EmploymentResult.astro has them.
function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
    </section>
    <section data-in-scope data-summary>
      <p data-partial hidden></p><p data-headline></p><ul data-warnings></ul>
    </section>
    <div data-items></div>
    <section data-information-section><div data-information></div></section>
    <section data-in-scope><ul data-unchecked></ul></section>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span><h3 data-title></h3>
        <blockquote data-clause-words hidden><p data-clause-text></p></blockquote>
        <p class="item__status"><svg data-mark><use href="#x"></use></svg><span data-status-text></span></p>
        <p data-question hidden></p><ul data-readings hidden></ul>
        <p data-total hidden></p><p data-answer-note hidden></p><p data-agreement-note hidden></p>
        <div data-literal hidden><p data-literal-intro></p><p data-literal-text></p><a data-literal-link></a></div>
        <h4 data-rules-title></h4><ul data-rules></ul><div data-detail-slot></div>
      </section>
    </template>
    <template data-template="rule"><li><a></a><span data-rule-status></span></li></template>
    <template data-template="detail">
      <details data-detail><div data-readings-detail></div><ul data-sources></ul></details>
    </template>
    <template data-template="reading">
      <div><h4 data-reading-title></h4><ol data-calculation></ol></div>
    </template>
    <template data-template="source"><li><a></a><span data-in-force></span></li></template>
    <template data-template="duty-detail">
      <details data-detail><ul data-duty-elements></ul></details>
    </template>
    <template data-template="duty-element">
      <li><p data-element-name></p><p><svg data-mark><use href="#x"></use></svg><span data-element-status></span></p><ul data-element-lines></ul></li>
    </template>
    <template data-template="offer-detail">
      <details data-detail><ul data-offer-differences></ul><ul data-offer-not-compared></ul></details>
    </template>
    <template data-template="reference-detail">
      <div data-reference><ul data-reference-figures></ul><ul data-reference-sources></ul></div>
    </template>
    <template data-template="information">
      <details><summary data-info-title></summary><ul data-info-text></ul><ul data-info-links></ul></details>
    </template>`;
  return root;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

const render = (input: EmploymentInput, locked: boolean) => {
  const root = result();
  renderEmploymentResult(root, { review: review(input), input }, locked, tr);
  return root;
};

const card = (root: HTMLElement, title: string) =>
  [...root.querySelectorAll('[data-item]')].find(
    (el) => text(el.querySelector('[data-title]')) === title,
  );

function phrasesOf(input: EmploymentInput): EmploymentPhrase[] {
  const r = review(input);
  const nested = (p: EmploymentPhrase): EmploymentPhrase[] => [
    p,
    ...Object.values(p.vars ?? {}).flatMap((v) =>
      typeof v === 'object' && 'key' in v ? nested(v) : [],
    ),
  ];
  return [
    ...everyAssessed(r).flatMap((a) =>
      a.kind === 'single' ? [a.finding] : a.readings.map((x) => x.finding),
    ),
  ]
    .flatMap((x) => x.calculation)
    .concat(r.information.flatMap((b) => b.calculation))
    .flatMap(nested);
}

describe('the employment result', () => {
  it('words every phrase it meets, with no placeholder left', () => {
    for (const input of corners)
      for (const p of phrasesOf(input)) {
        const said = phraseText(p, tr);
        expect(said, p.key).not.toMatch(/[{}]|client\./);
      }
  });

  it('writes a year as it is written and counts in words', () => {
    const lines = phrasesOf(belowMinimum).map((p) => phraseText(p, tr));
    expect(lines).toContain(
      '2026: SMI de 17.094,00 €; tu salario, 16.100,00 €. Faltan 994,00 € al año; en 281 días de contrato ese año, 765,24 €.',
    );
    expect(lines.join(' ')).not.toMatch(/2\.026/);
  });

  it('shows the shortfall against the minimum wage rounded, per year and since the start', () => {
    const root = render(belowMinimum, false);
    const smi = card(root, 'Salario frente al SMI');
    expect(text(smi?.querySelector('[data-status-text]'))).toMatch(
      /Por debajo del SMI: unos 990\s€ al año/,
    );
    expect(text(smi?.querySelector('[data-total]'))).toMatch(/^Desde 2026, unos 770\s€ en total/);
    expect(text(smi?.querySelector('[data-total]'))).toMatch(/art\. 59\.2/);
  });

  it('keeps the cents of a shortfall per working day', () => {
    const root = render(shortDayRate, false);
    const smi = card(root, 'Salario por jornada frente al SMI');
    expect(text(smi?.querySelector('[data-status-text]'))).toMatch(
      /^Por debajo del SMI: 7,82\s€ por jornada$/,
    );
    expect(smi?.querySelector<HTMLElement>('[data-total]')?.hidden).toBe(true);
    expect(text(card(root, 'Pagas extra')?.querySelector('[data-status-text]'))).toBe(
      'Dentro del límite',
    );
  });

  it('counts the lower shortfall when both readings fall short, the higher only as «y hasta»', () => {
    const root = render(shortDayRateDoubt, true);
    const status = text(
      card(root, 'Salario por jornada frente al SMI')?.querySelector('[data-status-text]'),
    );
    expect(status).toBe(
      'Por debajo del SMI: 2,82 € por jornada, y hasta 12,82 € según tu respuesta',
    );
  });

  it('gives no total since the start when years before the table are left out', () => {
    const root = render({ ...belowMinimum, startDate: f('2021-06-01') }, false);
    const smi = card(root, 'Salario frente al SMI');
    expect(smi?.querySelector<HTMLElement>('[data-total]')?.hidden).toBe(true);
  });

  it('quotes art. 15.4 for a work-or-service contract, with the law’s words', () => {
    const root = render(workOrService, true);
    const modality = card(root, 'Modalidad de contrato');
    expect(text(modality?.querySelector('[data-literal-intro]'))).toContain(
      'El artículo 15.4 del Estatuto de los Trabajadores dice que',
    );
    expect(text(modality?.querySelector('[data-literal-text]'))).toContain('condición de fijas');
    expect(text(root)).not.toMatch(/eres fij[oa]|te convierte en fij[oa]|ya eres|te deben/);
  });

  it('shows each reading of a doubt, with amounts rounded as a pair', () => {
    const root = render(unknownComplement, false);
    const smi = card(root, 'Salario frente al SMI');
    expect(text(smi?.querySelector('[data-status-text]'))).toBe('Depende');
    const readings = [...(smi?.querySelectorAll('[data-readings] li') ?? [])].map(text);
    expect(readings).toHaveLength(2);
    expect(readings.join(' | ')).toMatch(/Si cuentan todos los complementos: dentro del límite/);
    expect(readings.join(' | ')).toMatch(
      /Si solo cuentan .*: por debajo del SMI en unos [\d.]+\s€ al año/,
    );
  });

  it('names the art. 21.2 doubt by the post, not by the qualified technician asked', () => {
    const input = contract({
      technical: false,
      clauses: [
        {
          label: 'non_compete',
          months: 12,
          compensationStated: true,
          trainingDescribed: null,
          waivedRight: null,
          costsOnWorker: null,
          literal: { text: '' },
        },
      ],
    });
    const clause = card(render(input, false), 'No competencia');
    expect(text(clause?.querySelector('[data-question]'))).toBe(
      'Depende de si tu puesto es técnico (art. 21.2):',
    );
    const readings = [...(clause?.querySelectorAll('[data-readings] li') ?? [])].map(text);
    expect(readings[0]).toMatch(/^Si tu puesto es técnico: /);
    expect(readings[1]).toMatch(/^Si no lo es: /);
    expect(text(clause)).not.toMatch(/técnico titulado/);
  });

  it('leaves the detail out entirely while it is locked', () => {
    const locked = render(workOrService, true);
    expect(locked.querySelector('[data-detail]')).toBeNull();
    expect(locked.querySelector('[data-reference]')).toBeNull();
    const open = render(workOrService, false);
    expect(open.querySelector('[data-detail]')).not.toBeNull();
    expect(text(open.querySelector('[data-reference]'))).toMatch(/Despido improcedente/);
  });

  it('marks a partial review of a contract from before the reform', () => {
    const root = render(contract({ startDate: f('2021-06-01'), signedOn: null }), false);
    expect(root.querySelector<HTMLElement>('[data-partial]')?.hidden).toBe(false);
  });

  it('gives a minor the rules that apply, as information', () => {
    const root = result();
    const r = review(contract({ under18: true }));
    renderOutOfScope(root, 'minor', r.information, tr);
    expect(text(root.querySelector('[data-out-of-scope-reason]'))).toMatch(/menos de 18 años/);
    expect(text(root.querySelector('[data-information]'))).toMatch(/8 horas al día/);
    expect(root.querySelector<HTMLElement>('[data-summary]')?.hidden).toBe(true);
  });
});
