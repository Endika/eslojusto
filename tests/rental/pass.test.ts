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

// The data attributes PassOffer.astro renders for the rental review, without its copy.
const RENTAL_OFFER = `
<section data-pass-offer hidden>
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
    <fieldset data-letter>
      <input data-letter-field="name" />
      <input data-letter-field="id" />
      <p data-letter-id-warning hidden></p>
      <input data-letter-field="landlord" />
      <input data-letter-field="address" />
      <input data-letter-field="place" />
      <input type="date" data-letter-field="date" />
      <div data-letter-kind="deposit_return"><input data-letter-field="iban" /></div>
      <p data-letter-glyph-warning hidden></p>
      <button data-download="letter" data-letter-kind="deposit_return">Deposit</button>
      <button data-download="letter" data-letter-kind="rent_review">Rent</button>
    </fieldset>
  </div>
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

const built: { kind: LetterKind; details: LetterDetails }[] = [];
const model: DocumentModel = { title: 'x', footer: null, blocks: [] };
const review = (letterKinds: LetterKind[]): PaidReview => ({
  offer: true,
  letterKinds,
  report: () => model,
  letter: (kind, details) => {
    built.push({ kind, details });
    return model;
  },
  filename: (document, kind) =>
    document === 'report'
      ? 'client.rental.report.filename'
      : kind === 'deposit_return'
        ? 'client.rental.letter.deposit.filename'
        : 'client.rental.letter.rent.filename',
});

function setUp() {
  document.body.innerHTML = RENTAL_OFFER;
  built.length = 0;
  const passes = createPassStore(memoryStore(), () => NOW);
  passes.savePass({ token: validPass, expiresAt: EXPIRES, readsLeft: 15 });
  const events = recordingEvents();
  const saved: string[] = [];
  const api: Api = {
    extract: async () => ({ ok: false, code: 'service_unavailable' }),
    checkout: async () => ({ ok: false, code: 'service_unavailable' }),
    pass: async () => ({ ok: false, code: 'service_unavailable' }),
    verify: async () => ({ ok: true, expiresAt: EXPIRES, readsLeft: 15 }),
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
  return { payment, events, saved };
}

describe('the rental pass downloads', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('show only the letters the review offers, and the account only with the deposit’s', async () => {
    const { payment } = setUp();
    payment.show(review(['rent_review']));
    await flush();
    expect($('[data-pass-downloads]').hidden).toBe(false);
    expect($('[data-letter]').hidden).toBe(false);
    expect($('button[data-letter-kind="rent_review"]').hidden).toBe(false);
    expect($('button[data-letter-kind="deposit_return"]').hidden).toBe(true);
    expect($('div[data-letter-kind="deposit_return"]').hidden).toBe(true);

    payment.show(review(['deposit_return', 'rent_review']));
    expect($('button[data-letter-kind="deposit_return"]').hidden).toBe(false);
    expect($('div[data-letter-kind="deposit_return"]').hidden).toBe(false);

    payment.show(review([]));
    expect($('[data-letter]').hidden).toBe(true);
    expect($('[data-download="report"]').hidden).toBe(false);
  });

  it('each letter button builds its own letter, with the rental fields, and names its file', async () => {
    const { payment, saved, events } = setUp();
    payment.show(review(['deposit_return', 'rent_review']));
    await flush();
    type('name', 'Alex Ejemplo');
    type('landlord', 'Inmuebles Ficticios SL');
    type('address', 'Calle Inventada 0');
    type('iban', 'ES00 0000 0000 0000 0000 0000');
    await click('button[data-letter-kind="deposit_return"]');
    await click('button[data-letter-kind="rent_review"]');
    await click('[data-download="report"]');
    expect(built.map((b) => b.kind)).toEqual(['deposit_return', 'rent_review']);
    expect(built[0]?.details).toEqual({
      name: 'Alex Ejemplo',
      id: '',
      company: '',
      landlord: 'Inmuebles Ficticios SL',
      address: 'Calle Inventada 0',
      place: '',
      iban: 'ES00 0000 0000 0000 0000 0000',
      date: { y: 2026, m: 10, d: 8 },
    });
    expect(saved).toEqual([
      'eslojusto-carta-fianza.pdf',
      'eslojusto-carta-renta.pdf',
      'eslojusto-informe-alquiler.pdf',
    ]);
    expect(events.log.slice(1)).toEqual([
      ['downloaded', 'letter', 'some', 'deposit_return'],
      ['downloaded', 'letter', 'some', 'rent_review'],
      ['downloaded', 'report'],
    ]);
  });

  it('counts as filled only the fields the letter asks for', async () => {
    const { payment, events } = setUp();
    payment.show(review(['deposit_return', 'rent_review']));
    await flush();
    for (const field of ['name', 'id', 'landlord', 'address', 'place']) type(field, 'Ficticio');
    // The account goes only on the deposit's letter: left empty, the rent letter is still full.
    await click('button[data-letter-kind="rent_review"]');
    await click('button[data-letter-kind="deposit_return"]');
    payment.show(review(['rent_review']));
    type('iban', 'ES00 0000');
    await click('button[data-letter-kind="rent_review"]');
    expect(events.log.slice(1)).toEqual([
      ['downloaded', 'letter', 'all', 'rent_review'],
      ['downloaded', 'letter', 'some', 'deposit_return'],
      ['downloaded', 'letter', 'all', 'rent_review'],
    ]);
  });

  it('a rental field with a character the fonts lack keeps its blank line, with a warning', async () => {
    const { payment } = setUp();
    payment.show(review(['deposit_return']));
    await flush();
    type('name', 'Alex Ejemplo');
    type('landlord', '王小明');
    type('address', 'Ελλάδα 1');
    type('iban', 'ES00 0000');
    await click('button[data-letter-kind="deposit_return"]');
    expect(built[0]?.details).toMatchObject({
      name: 'Alex Ejemplo',
      landlord: '',
      address: '',
      iban: 'ES00 0000',
    });
    expect($('[data-letter-glyph-warning]').hidden).toBe(false);
  });

  it('starting over forgets the rental fields too', () => {
    const { payment } = setUp();
    payment.show(review(['deposit_return']));
    type('landlord', 'Inmuebles Ficticios SL');
    type('iban', 'ES00 0000');
    payment.hide();
    expect($<HTMLInputElement>('[data-letter-field="landlord"]').value).toBe('');
    expect($<HTMLInputElement>('[data-letter-field="iban"]').value).toBe('');
  });
});

describe('the letter fields the fonts cannot draw', () => {
  it('cover the rental fields', () => {
    expect(
      unprintable({
        name: 'Alex',
        id: '',
        company: '',
        place: 'Villaficticia',
        landlord: '王小明',
        address: 'Ελλάδα 1',
        iban: 'ES00 0000',
      }),
    ).toEqual(['landlord', 'address']);
  });
});
