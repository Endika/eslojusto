import { BE1904 } from '../../src/engine/credit/data/be1904';
import { CREDIT_NORMS } from '../../src/engine/credit/data/norms';
import { CREDIT_SOURCES } from '../../src/engine/credit/data/sources';
import type { CreditInput } from '../../src/engine/credit/types';
import { parseDate } from '../../src/engine/date';
import { loan } from '../engine/credit/input';

export const DEPS = {
  norms: CREDIT_NORMS,
  sources: CREDIT_SOURCES,
  rates: {
    'BE_19_4.7': BE1904['BE_19_4.7'],
    'BE_19_4.9': BE1904['BE_19_4.9'],
    'BE_19_4.10': BE1904['BE_19_4.10'],
    'BE_19_4.11': BE1904['BE_19_4.11'],
  },
};

// The result's hooks and templates, as CreditResult.astro has them.
export function result(): HTMLElement {
  const root = document.createElement('section');
  root.innerHTML = `
    <p data-lead></p>
    <p data-count hidden></p>
    <section data-out-of-scope hidden>
      <span data-out-of-scope-status></span><p data-out-of-scope-reason></p>
    </section>
    <div data-items></div>
    <section data-in-scope><div data-information></div></section>
    <section data-in-scope><ul data-unchecked></ul></section>
    <template data-template="item">
      <section data-item>
        <span data-tab-number></span><h3 data-title></h3>
        <p><svg data-mark><use href="#x"></use></svg><span data-status-text></span></p>
        <p data-depends hidden></p>
        <ol data-calculation></ol><div data-readings></div>
        <h4 data-rules-title></h4><ul data-rules></ul>
      </section>
    </template>
    <template data-template="reading">
      <div><h4 data-reading-title></h4><p data-reading-status></p><ol data-calculation></ol></div>
    </template>
    <template data-template="rule"><li><a></a><span data-rule-status></span></li></template>
    <template data-template="information">
      <details><summary data-info-title></summary><p data-info-text></p><ul data-info-links></ul></details>
    </template>`;
  return root;
}

// A synthetic revolving card with a balance, on the assumptions of annex I, part II.
export const card = (change: Partial<CreditInput> = {}): CreditInput =>
  loan({
    product: 'revolving',
    agreedOn: parseDate('2024-03-10'),
    drawnOn: parseDate('2024-03-10'),
    principal: 1_500,
    netDisbursed: null,
    nominalRate: 21.94,
    declaredApr: 24.29,
    declaredTotalPayable: null,
    instalments: null,
    charges: [],
    card: { limit: 1_500, nominalRate: 21.94, annualFee: 0, minimumPayment: 60, balance: 1_200 },
    ...change,
  });
