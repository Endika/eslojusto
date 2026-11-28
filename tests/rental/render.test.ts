// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  dependsPieces,
  informationText,
  renderOutOfScope,
  renderRentalResult,
} from '../../src/rental/render';
import { summarise } from '../../src/rental/summary';
import { parseDate as f } from '../../src/engine/date';
import { NORMS } from '../../src/engine/rental/data/norms';
import { informationBlocks, type InformationBlock } from '../../src/engine/rental/information';
import { NORMS_BEFORE_VOTE } from '../engine/rental/norms-before-vote';
import {
  contract,
  repealedWindow,
  review,
  riseAboveIrav,
  tr,
  unknownLargeLandlord,
} from './fixtures';
import type { RentalInput } from '../../src/engine/rental/types';

// The result's hooks and templates, as RentalResult.astro has them.
function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
    </section>
    <section data-in-scope data-summary><p data-headline></p><ul data-totals></ul></section>
    <div data-items></div>
    <section data-in-scope><div data-information></div></section>
    <section data-in-scope><ul data-unchecked></ul></section>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span><h3 data-title></h3>
        <p class="item__status"><svg data-mark><use href="#x"></use></svg><span data-status-text></span></p>
        <p data-depends hidden></p><p data-total-share hidden></p><p data-hint hidden></p>
        <ul data-rules></ul><div data-detail-slot></div>
      </section>
    </template>
    <template data-template="rule"><li><a></a><span data-rule-status></span></li></template>
    <template data-template="detail">
      <details data-detail><div data-readings></div><ul data-sources></ul></details>
    </template>
    <template data-template="reading">
      <div><h4 data-reading-title></h4><dl data-figures></dl><ol data-calculation></ol></div>
    </template>
    <template data-template="figure"><div><dt></dt><dd></dd></div></template>
    <template data-template="source"><li><a></a><span data-in-force></span></li></template>
    <template data-template="information">
      <details><summary data-info-title></summary><p data-info-text></p><ul data-info-links></ul></details>
    </template>`;
  return root;
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/g, ' ');

const render = (input: RentalInput, locked: boolean) => {
  const root = result();
  renderRentalResult(root, { review: review(input), input }, locked, tr);
  return root;
};

const firstRise = (input: RentalInput) => {
  const item = review(input).items.find((i) => i.kind === 'rent_update');
  if (!item) throw new Error('no rise');
  return item;
};

describe('the summary of an item', () => {
  const dependsText = (input: RentalInput) => {
    const s = summarise(firstRise(input));
    if (s.kind !== 'depends') throw new Error('expected depends');
    const el = document.createElement('p');
    el.replaceChildren(...dependsPieces(s, tr));
    return text(el);
  };

  it('words a reading with no figure by its result, never as «0 €»', () => {
    // 30 a month from June 2023 to October 2026: 41 months = 1.230 €.
    expect(dependsText(unknownLargeLandlord)).toBe(
      'Depende de si tu casero es gran tenedor: no se puede comprobar o pagas de más unos 1.230 €',
    );
  });

  it('gives a range when both readings have a figure: within the limit is 0 €', () => {
    expect(dependsText(repealedWindow)).toMatch(
      /^Depende de cómo se lea una norma que ya está derogada: entre 0 € y \d+ €$/,
    );
  });
});

describe('the result', () => {
  it('out of scope for a room rental, it tells RDL 29/2026 as validated', () => {
    const root = render(riseAboveIrav, true);
    renderOutOfScope(root, 'room', NORMS.rdl29_2026.status, tr);
    const reason = text(root.querySelector('[data-out-of-scope-reason]'));
    expect(reason).toContain(
      'en vigor desde el 8 de octubre de 2026 y convalidado por el Congreso',
    );
    expect(reason).not.toContain('pendiente');
  });

  it('out of scope for a room rental, it tells RDL 29/2026 as pending while it awaits the vote', () => {
    const root = render(riseAboveIrav, true);
    renderOutOfScope(root, 'room', NORMS_BEFORE_VOTE.rdl29_2026.status, tr);
    expect(text(root.querySelector('[data-out-of-scope-reason]'))).toContain(
      'en vigor desde el 8 de octubre de 2026 y pendiente de convalidación',
    );
  });
});

describe('the information blocks tell each decree as the norm table has it', () => {
  const block = (id: InformationBlock['id'], norms: typeof NORMS) =>
    informationBlocks(
      contract({ signedOn: f('2022-01-05'), startDate: f('2022-01-10'), agreedMonths: 12 }),
      norms,
    ).find((b) => b.id === id);

  it('RDL 29/2026 as validated', () => {
    const b = block('extension_rdl29', NORMS);
    expect(b && informationText(b, tr).text).toContain(
      'El Real Decreto-ley 29/2026, convalidado por el Congreso, prevé una prórroga extraordinaria',
    );
  });

  it('RDL 28/2026 only while it awaits the vote, never once repealed before it took effect', () => {
    expect(block('extensions_rdl28', NORMS)).toBeUndefined();
    const b = block('extensions_rdl28', NORMS_BEFORE_VOTE);
    expect(b && informationText(b, tr).text).toContain(
      'El Real Decreto-ley 28/2026, pendiente de convalidación, cambia las prórrogas',
    );
  });
});
