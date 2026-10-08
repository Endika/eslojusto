// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import type { Api } from '../../src/documents/contract';
import type { LetterDetails, LetterKind } from '../../src/documents/letter';
import { createPassStore } from '../../src/documents/pass';
import { setUpPayment } from '../../src/documents/payment';
import { unprintable } from '../../src/documents/pdf';
import type { DocumentModel, PaidReview } from '../../src/documents/ports';
import { flush, recordingEvents } from '../documents/dom';
import { memoryStore, passToken } from '../documents/fixtures';
import { tr } from './fixtures';

const NOW = Date.UTC(2026, 9, 8);
const EXPIRES = NOW / 1000 + 7 * 86400;
const validPass = passToken({ typ: 'pass', sid: 'cs_test_1', exp: EXPIRES });

// The data attributes PassOffer.astro renders for the contract review, without its copy: the
// letters sit below the paid downloads.
const EMPLOYMENT_OFFER = `
<section data-pass-offer hidden>
  <h3><span data-pass-pitch>Pass</span><span data-pass-free-only hidden>Free letters</span></h3>
  <p data-pass-pitch>Pitch</p>
  <p data-pass-free-only hidden>Only information</p>
  <div data-pass-buy>
    <input type="checkbox" id="pass-waiver" />
    <p data-pass-waiver-error hidden></p>
    <button data-pass-pay>Pay</button>
    <input id="pass-session" />
    <button data-pass-recover-button>Recover</button>
  </div>
  <div data-pass-downloads hidden>
    <p data-pass-validity></p>
    <button data-download="report">Report</button>
  </div>
  <fieldset data-letter>
    <input data-letter-field="name" />
    <input data-letter-field="id" />
    <p data-letter-id-warning hidden></p>
    <input data-letter-field="company" />
    <input data-letter-field="workplace" />
    <input data-letter-field="place" />
    <input type="date" data-letter-field="date" />
    <p data-letter-glyph-warning hidden></p>
    <button data-download="letter" data-letter-kind="information_request">Information</button>
    <button data-download="letter" data-letter-kind="temporary_contracts_certificate">Certificate</button>
    <button data-download="letter" data-letter-kind="employment">Company</button>
  </fieldset>
  <p data-pass-status></p>
  <p data-pass-error hidden></p>
  <button data-pass-verify-retry hidden>Retry</button>
</section>`;

const $ = <T extends HTMLElement>(s: string) => document.querySelector(s) as T;
const click = async (s: string) => {
  $(s).dispatchEvent(new Event('click'));
  await flush();
  await flush();
};
const type = (field: string, value: string) => {
  $<HTMLInputElement>(`[data-letter-field="${field}"]`).value = value;
};
const shown = (s: string) => !$(s).hidden && $(s).closest('[hidden]') === null;

const built: { kind: LetterKind; details: LetterDetails }[] = [];
const model: DocumentModel = { title: 'x', footer: null, blocks: [] };
const review = (
  offer: boolean,
  letterKinds: LetterKind[],
  freeLetterKinds: LetterKind[],
): PaidReview => ({
  offer,
  letterKinds,
  freeLetterKinds,
  report: () => model,
  letter: (kind, details) => {
    built.push({ kind, details });
    return model;
  },
  filename: (document, kind) =>
    document === 'report'
      ? 'client.employment.report.filename'
      : kind === 'employment'
        ? 'client.employment.letter.company.filename'
        : kind === 'temporary_contracts_certificate'
          ? 'client.employment.letter.certificate.filename'
          : 'client.employment.letter.information.filename',
});

function setUp(withPass: boolean) {
  document.body.innerHTML = EMPLOYMENT_OFFER;
  built.length = 0;
  const passes = createPassStore(memoryStore(), () => NOW);
  if (withPass) passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
  const events = recordingEvents();
  const saved: string[] = [];
  const verified: string[] = [];
  const api: Api = {
    extract: async () => ({ ok: false, code: 'service_unavailable' }),
    checkout: async () => ({ ok: false, code: 'service_unavailable' }),
    pass: async () => ({ ok: false, code: 'service_unavailable' }),
    verify: async (token) => {
      verified.push(token);
      return { ok: true, expiresAt: EXPIRES, readsLeft: 15 };
    },
  };
  const payment = setUpPayment($('[data-pass-offer]'), {
    api,
    captcha: { token: async () => 'checkout-token' },
    passes,
    events,
    browser: {
      now: () => NOW,
      redirect: () => {},
      save: (_blob, name) => void saved.push(name),
      randomBytes: (n) => new Uint8Array(n),
      warnBeforeLeaving: () => {},
    },
    tr,
    pdf: async () => ({ render: async () => new Blob(['%PDF']), unprintable }),
    keepReview: () => {},
    today: () => ({ y: 2026, m: 10, d: 8 }),
    passChanged: () => {},
  });
  return { payment, events, saved, verified };
}

describe('the contract review’s letters', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('with nothing to sell, show only the free letters under their own title', async () => {
    const { payment } = setUp(false);
    payment.show(review(false, [], ['information_request']));
    await flush();
    expect($('[data-pass-offer]').hidden).toBe(false);
    expect(shown('[data-pass-buy]')).toBe(false);
    expect(shown('span[data-pass-pitch]')).toBe(false);
    expect(shown('p[data-pass-pitch]')).toBe(false);
    expect(shown('span[data-pass-free-only]')).toBe(true);
    expect(shown('[data-letter-kind="information_request"]')).toBe(true);
    expect(shown('[data-letter-kind="temporary_contracts_certificate"]')).toBe(false);
    expect(shown('[data-letter-kind="employment"]')).toBe(false);
    expect(shown('[data-download="report"]')).toBe(false);
  });

  it('with nothing to sell and nothing free, show nothing', async () => {
    const { payment } = setUp(false);
    payment.show(review(false, [], []));
    await flush();
    expect($('[data-pass-offer]').hidden).toBe(true);
  });

  it('download a free letter without asking about any pass', async () => {
    const { payment, saved, events, verified } = setUp(false);
    payment.show(review(true, ['employment'], ['temporary_contracts_certificate']));
    await flush();
    expect(shown('[data-pass-buy]')).toBe(true);
    expect(shown('span[data-pass-pitch]')).toBe(true);
    expect(shown('[data-letter-kind="temporary_contracts_certificate"]')).toBe(true);
    expect(shown('[data-letter-kind="employment"]')).toBe(false);
    type('name', 'Alex Ejemplo');
    type('company', 'Talleres Ficticios SL');
    type('workplace', 'Calle Inventada 0');
    await click('[data-letter-kind="temporary_contracts_certificate"]');
    expect(verified).toEqual([]);
    expect(built.map((b) => b.kind)).toEqual(['temporary_contracts_certificate']);
    expect(built[0]?.details).toEqual({
      name: 'Alex Ejemplo',
      id: '',
      company: 'Talleres Ficticios SL',
      workplace: 'Calle Inventada 0',
      place: '',
      date: { y: 2026, m: 10, d: 8 },
    });
    expect(saved).toEqual(['eslojusto-certificado-contratos-temporales.pdf']);
    expect(events.log).toEqual([
      ['downloaded', 'letter', 'some', 'temporary_contracts_certificate'],
    ]);
  });

  it('never build the paid letter or the report without a pass', async () => {
    const { payment, saved } = setUp(false);
    payment.show(review(true, ['employment'], []));
    await flush();
    await click('[data-letter-kind="employment"]');
    await click('[data-download="report"]');
    expect(built).toEqual([]);
    expect(saved).toEqual([]);
  });

  it('with the pass, add the report and the company letter to the free ones', async () => {
    const { payment, saved, events } = setUp(true);
    payment.show(review(true, ['employment'], ['information_request']));
    await flush();
    expect(shown('[data-pass-buy]')).toBe(false);
    expect(shown('[data-download="report"]')).toBe(true);
    expect(shown('[data-letter-kind="employment"]')).toBe(true);
    expect(shown('[data-letter-kind="information_request"]')).toBe(true);
    for (const field of ['name', 'id', 'company', 'workplace', 'place']) type(field, 'Ficticio');
    await click('[data-letter-kind="employment"]');
    await click('[data-letter-kind="information_request"]');
    await click('[data-download="report"]');
    expect(built.map((b) => b.kind)).toEqual(['employment', 'information_request']);
    expect(saved).toEqual([
      'eslojusto-carta-empresa.pdf',
      'eslojusto-carta-informacion.pdf',
      'eslojusto-informe-contrato.pdf',
    ]);
    expect(events.log.slice(1)).toEqual([
      ['downloaded', 'letter', 'all', 'employment'],
      ['downloaded', 'letter', 'all', 'information_request'],
      ['downloaded', 'report'],
    ]);
  });

  it('a pass held where nothing is sold shows the downloads, not the free-only title', async () => {
    const { payment } = setUp(true);
    payment.show(review(false, [], ['information_request']));
    await flush();
    expect(shown('span[data-pass-pitch]')).toBe(true);
    expect(shown('span[data-pass-free-only]')).toBe(false);
    expect(shown('[data-download="report"]')).toBe(true);
  });
});

describe('the letter fields the fonts cannot draw', () => {
  it('cover the contract review’s fields', () => {
    expect(
      unprintable({
        name: 'Alex',
        id: '',
        company: '王小明 SL',
        place: 'Villaficticia',
        workplace: 'Ελλάδα 1',
      }),
    ).toEqual(['company', 'workplace']);
  });
});
