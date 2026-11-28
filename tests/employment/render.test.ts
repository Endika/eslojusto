// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { EmploymentPhrase } from '../../src/engine/employment/calculation';
import { everyAssessed } from '../../src/engine/employment/review';
import type { EmploymentInput } from '../../src/engine/employment/types';
import { phraseText, renderEmploymentResult, renderOutOfScope } from '../../src/employment/render';
import { belowMinimum, contract, corners, review, tr, workOrService } from './fixtures';

// The result's hooks and templates, as EmploymentResult.astro has them.
function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
      <p data-out-of-scope-household hidden><a></a></p>
    </section>
    <section data-in-scope data-summary>
      <p data-partial hidden></p><p data-headline></p><p data-count hidden></p><ul data-warnings></ul>
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

describe('the rules under each point', () => {
  const statuses = () => {
    const root = render(belowMinimum, false);
    const rules = card(root, 'Salario frente al SMI')?.querySelectorAll('[data-rules] li') ?? [];
    return new Map(
      [...rules].map((li) => [
        text(li.querySelector('a')),
        text(li.querySelector('[data-rule-status]')),
      ]),
    );
  };

  it('dates a yearly SMI decree by the days it had effect, never «en vigor»', () => {
    expect(statuses().get('art. 3.1 (Real Decreto 126/2026, de 18 de febrero)')).toBe(
      'con efectos del 01-01-2026 al 31-12-2026',
    );
  });
});

describe('the employment result', () => {
  it('words every phrase it meets, with no placeholder left', () => {
    for (const input of corners)
      for (const p of phrasesOf(input)) {
        const said = phraseText(p, tr);
        expect(said, p.key).not.toMatch(/[{}]|client\./);
      }
  });

  it('quotes art. 15.4 for a work-or-service contract, with the law’s words', () => {
    const root = render(workOrService, false);
    const modality = card(root, 'Modalidad de contrato');
    expect(text(modality?.querySelector('[data-literal-intro]'))).toContain(
      'El artículo 15.4 del Estatuto de los Trabajadores dice que',
    );
    expect(text(modality?.querySelector('[data-literal-text]'))).toContain('condición de fijas');
    expect(text(root)).not.toMatch(/eres fij[oa]|te convierte en fij[oa]|ya eres|te deben/);
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

  it('locked with something to claim: how many points, never which', () => {
    const root = render(belowMinimum, true);
    expect(root.querySelectorAll('[data-items] > *')).toHaveLength(0);
    expect(text(root.querySelector('[data-count]'))).toBe('Es un punto.');
    expect(text(root.querySelector('[data-lead]'))).toBe(
      'Cuántos puntos no cumplen. Cuáles son, con su cálculo y la norma en que se apoya, va con el pase.',
    );
    expect(root.textContent).not.toContain('SMI');
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
