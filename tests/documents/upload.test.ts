// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { formEntries, setEntry } from '../../src/calculator/fill';
import type { Api, ExtractRequest, ExtractResult, PassResult } from '../../src/documents/contract';
import { createOutageMemory } from '../../src/documents/outage';
import { canDownload, createPassStore, passState } from '../../src/documents/pass';
import { setUpUpload } from '../../src/documents/upload';
import { START, flush, recordingEvents } from './dom';
import { memoryStore, passToken, tr } from './fixtures';

const NOW = Date.UTC(2026, 9, 7);

// What the page measures of a synthetic photo, told by its name.
const looks = (f: File) => ({
  brightness: f.name.includes('oscura') ? 30 : 200,
  sharpness: f.name.includes('borrosa') ? 10 : 5000,
  longSide: f.name.includes('pequena') ? 600 : 1568,
});

// A read the test answers by hand, to look at the page while it is on its way.
const pending: { next: Promise<ExtractResult> | null } = { next: null };

function setUp(
  result: ExtractResult,
  options: {
    captchaFails?: boolean;
    passAgain?: PassResult;
    // Holds every PDF open until the test lets it go.
    pdfGate?: Promise<void>;
    slowPages?: boolean;
  } = {},
) {
  document.body.innerHTML = START;
  const store = memoryStore();
  const passes = createPassStore(store, () => NOW);
  const session = memoryStore();
  const outage = createOutageMemory(session, () => NOW);
  const shares: number[] = [];
  const closed: string[] = [];
  const passCalls: string[] = [];
  const events = recordingEvents();
  const requests: ExtractRequest[] = [];
  const opened: number[] = [];
  const form = document.querySelector<HTMLFormElement>('#calculator') as HTMLFormElement;
  const api: Api = {
    extract: async (r) => {
      requests.push(r);
      const answer = pending.next ?? Promise.resolve(result);
      pending.next = null;
      return answer;
    },
    checkout: async () => ({ ok: false, code: 'service_unavailable' }),
    pass: async (sessionId) => {
      passCalls.push(sessionId);
      return options.passAgain ?? { ok: false, code: 'service_unavailable' };
    },
    verify: async () => ({ ok: false, code: 'service_unavailable' }),
  };
  const upload = setUpUpload(document.querySelector('[data-documents-start]') as HTMLElement, {
    api,
    captcha: {
      token: () =>
        options.captchaFails ? Promise.reject(new Error('blocked')) : Promise.resolve('captcha'),
    },
    encoder: {
      encode: async (f, maxBytes) => {
        shares.push(maxBytes);
        return { mediaType: 'image/jpeg', data: btoa(f.name), bytes: f.size, quality: looks(f) };
      },
    },
    // A fake PDF: its text is its page count, «cifrado» in its name makes it encrypted.
    pdfs: {
      open: async (f) => {
        if (f.name.includes('cifrado')) return 'pdf_encrypted';
        const pages = Number(await f.text()) || 1;
        await options.pdfGate;
        return {
          pages,
          render: async (n, maxBytes) => {
            if (options.slowPages) return 'pdf_too_slow';
            shares.push(maxBytes);
            return { mediaType: 'image/jpeg', data: btoa(`${f.name}#${n}`), bytes: 1 };
          },
          close: () => void closed.push(f.name),
        };
      },
    },
    passes,
    events,
    outage,
    now: () => NOW,
    tr,
    calculator: {
      form,
      fill: (entries) => entries.filter(([n, v]) => !setEntry(form, n, v)).map(([n]) => n),
      open: () => void opened.push(1),
      entries: () => formEntries(form),
    },
    tabs: document.querySelector('.tabs'),
  });
  upload.showStart();
  return {
    upload,
    store,
    session,
    outage,
    shares,
    closed,
    passes,
    events,
    requests,
    opened,
    form,
    passCalls,
  };
}

const click = (selector: string) =>
  document.querySelector<HTMLElement>(selector)?.dispatchEvent(new Event('click'));

function pick(files: File[], input = '#document-files') {
  const el = document.querySelector(input) as HTMLInputElement;
  Object.defineProperty(el, 'files', { value: files, configurable: true });
  el.dispatchEvent(new Event('change'));
}

function choose(files: File[], { consent = true } = {}) {
  click('[data-start-panel="choose"] [data-start-upload]');
  (document.querySelector('#document-consent') as HTMLInputElement).checked = consent;
  pick(files);
}

const listed = () =>
  [...document.querySelectorAll('[data-doc-files] li')].map((li) => li.textContent);
const text = (selector: string) => document.querySelector(selector)?.textContent;

const submit = async () => {
  document
    .querySelector('[data-start-panel="upload"]')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  await flush();
};

const photo = new File(['x'], 'finiquito.jpg', { type: 'image/jpeg' });
type Read = Extract<ExtractResult, { ok: true }>;
const settlement: Read = {
  ok: true,
  extraction: {
    pages: [{ page: 1, kind: 'settlement_proposal', readability: 'ok' }],
    documents: [{ kind: 'settlement_proposal', pages: 1 }],
    fields: {
      cause: { value: 'unfair_dismissal', confidence: 'high', source: 'settlement_proposal' },
      startDate: { value: '2010-03-01', confidence: 'medium', source: 'settlement_proposal' },
      severance: { value: 40000, confidence: 'low', source: 'settlement_proposal' },
    },
    contracts: [],
    conflicts: [],
  },
  failedChecks: ['items_do_not_sum'],
  allowance: 'v1.quota.next',
  readsLeft: null,
  escalated: true,
};

describe('the start sheet', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('opens on the choice, with the form and the tabs hidden', () => {
    const { form } = setUp(settlement);
    expect(form.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('.tabs')?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-start-panel="choose"]')?.hidden).toBe(false);
  });

  it('«Rellenar a mano» goes to the calculator’s first sheet, and calls nothing', () => {
    const { form, opened, requests, events } = setUp(settlement);
    click('[data-start-manual]');
    expect(form.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('[data-documents-start]')?.hidden).toBe(true);
    expect(opened).toHaveLength(1);
    expect(requests).toHaveLength(0);
    expect(events.log).toEqual([['startChosen', 'manual']]);
  });

  it('asks for a file and the consent before sending anything, never for a kind', async () => {
    const { requests } = setUp(settlement);
    choose([], { consent: false });
    await submit();
    expect(requests).toHaveLength(0);
    const slip = (f: string) => document.querySelector(`[data-doc-error-for="${f}"]`)?.textContent;
    expect(slip('files')).toBe('Añade al menos una foto o un PDF');
    expect(slip('consent')).toBe('Para leer los documentos hace falta tu consentimiento');
    expect(document.activeElement?.id).toBe('document-files');
    expect(document.querySelector('[name="documentKind"]')).toBeNull();
  });

  it('reads a document: fills the form, marks each field and keeps the next quota', async () => {
    const { requests, store, form, events } = setUp(settlement);
    choose([photo]);
    await submit();
    expect(requests).toEqual([
      {
        files: [{ mediaType: 'image/jpeg', data: btoa('finiquito.jpg') }],
        captchaToken: 'captcha',
        quota: null,
      },
    ]);
    expect(store.get('eslojusto-lecturas')).toBe('v1.quota.next');
    expect(formEntries(form)).toEqual([
      ['cause', 'unfair_dismissal'],
      ['startDate', '2010-03-01'],
      ['figure_severance', '40.000,00'],
    ]);
    const marks = [...form.querySelectorAll('[data-read-mark]')].map((m) => m.textContent);
    expect(marks).toEqual([
      'Leído del documento · confianza alta',
      'Leído del documento · confianza media',
      'Leído del documento · confianza baja: compruébalo',
    ]);
    const startInput = form.querySelector('[name="startDate"]');
    expect(startInput?.getAttribute('aria-describedby')).toBe('hint-startDate read-startDate');
    expect(document.querySelector('[data-done-summary]')?.textContent).toContain(
      'Se han leído 3 datos',
    );
    expect(document.querySelector('[data-done-notes]')?.textContent).toContain('no suman el total');
    expect(events.log).toEqual([
      ['startChosen', 'upload'],
      ['uploadStarted', '1', 0],
      [
        'extractionCompleted',
        {
          kinds: ['settlement_proposal'],
          fields: 3,
          lowConfidence: true,
          failedChecks: true,
          conflicts: false,
          escalated: true,
          skippedReasons: [],
        },
      ],
    ]);
  });

  it('nothing is reviewed: «Revisar los datos» only opens the first sheet', async () => {
    const { opened, form } = setUp(settlement);
    choose([photo]);
    await submit();
    click('[data-start-continue]');
    expect(form.hidden).toBe(false);
    expect(opened).toHaveLength(1);
  });

  it('a mark goes away once the person changes the value', async () => {
    const { form } = setUp(settlement);
    choose([photo]);
    await submit();
    const input = form.querySelector('[name="startDate"]') as HTMLInputElement;
    input.value = '2011-01-01';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(form.querySelector('[data-read-mark="startDate"]')).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBe('hint-startDate');
    expect(form.querySelectorAll('[data-read-mark]')).toHaveLength(2);
  });

  it('with a valid pass, the read goes on the pass and its reads left are kept', async () => {
    const { requests, passes } = setUp({ ...settlement, allowance: null, readsLeft: 11 });
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 12 });
    passes.saveQuota('old-quota');
    choose([photo]);
    await submit();
    expect(requests[0]?.pass).toBe(token);
    expect(requests[0]).not.toHaveProperty('quota');
    expect(passes.pass()).toEqual({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 11 });
    expect(passes.quota()).toBe('old-quota');
  });

  it('a refunded pass is forgotten; a used-up one falls back to free reads next time', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    const revoked = setUp({ ok: false, code: 'pass_revoked' });
    revoked.passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
    choose([photo]);
    await submit();
    expect(revoked.passes.pass()).toBeNull();
    const used = setUp({ ok: false, code: 'pass_exhausted' });
    used.passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
    choose([photo]);
    await submit();
    expect(used.passes.pass()?.readsLeft).toBe(0);
    choose([photo]);
    await submit();
    expect(used.requests[1]).toHaveProperty('quota', null);
  });

  it('while a read is on its way, «Rellenar a mano» waits for it', async () => {
    let answer: (r: ExtractResult) => void = () => {};
    const { form, events, requests } = setUp(settlement);
    pending.next = new Promise<ExtractResult>((r) => (answer = r));
    choose([photo]);
    document
      .querySelector('[data-start-panel="upload"]')
      ?.dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    await flush();
    const manual = document.querySelector('[data-start-panel="upload"] [data-start-manual]');
    expect(manual?.getAttribute('aria-disabled')).toBe('true');
    manual?.dispatchEvent(new Event('click'));
    expect(form.hidden).toBe(true);
    answer(settlement);
    await flush();
    await flush();
    expect(requests).toHaveLength(1);
    expect(manual?.getAttribute('aria-disabled')).toBe('false');
    expect(events.log.filter(([e]) => e === 'startChosen')).toEqual([['startChosen', 'upload']]);
  });

  it('an expired or revoked pass is forgotten, so the next read is a free one', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    for (const code of ['pass_expired', 'pass_revoked'] as const) {
      const { passes, requests } = setUp({ ok: false, code });
      passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
      choose([photo]);
      await submit();
      expect(passes.pass(), code).toBeNull();
      choose([photo]);
      await submit();
      expect(requests[1], code).toHaveProperty('quota', null);
    }
  });

  it('a refused pass is fetched again from the payment it came from', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    const fresh = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600, v: 2 });
    const { passes, passCalls } = setUp(
      { ok: false, code: 'pass_invalid' },
      { passAgain: { ok: true, pass: fresh, expiresAt: NOW / 1000 + 3600, readsLeft: 9 } },
    );
    passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    passes.markRedeemed('cs_test_1', NOW / 1000 + 3600);
    choose([photo]);
    await submit();
    expect(passCalls).toEqual(['cs_test_1']);
    expect(passes.pass()).toEqual({
      token: fresh,
      expiresAt: NOW / 1000 + 3600,
      readsLeft: 9,
      renewed: true,
    });
    expect(document.querySelector('[data-doc-status]')?.textContent).toBe(
      'Tu pase se ha renovado. Prueba otra vez a leer los documentos.',
    );
  });

  it('the same token back is no renewal: the pass is retired at once', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    const { passes } = setUp(
      { ok: false, code: 'pass_invalid' },
      { passAgain: { ok: true, pass: token, expiresAt: NOW / 1000 + 3600, readsLeft: 9 } },
    );
    passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    passes.markRedeemed('cs_test_1', NOW / 1000 + 3600);
    choose([photo]);
    await submit();
    expect(passes.pass()?.usable).toBe(false);
  });

  it('after a refusal, reads are free again within at most one renewal', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    const fresh = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600, v: 2 });
    const { passes, passCalls, requests } = setUp(
      { ok: false, code: 'pass_invalid' },
      { passAgain: { ok: true, pass: fresh, expiresAt: NOW / 1000 + 3600, readsLeft: 9 } },
    );
    passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
    passes.addCheckout({ nonce: 'n'.repeat(32), sessionId: 'cs_test_1' });
    passes.markRedeemed('cs_test_1', NOW / 1000 + 3600);
    for (let i = 0; i < 3; i++) {
      choose([photo]);
      await submit();
    }
    expect(passCalls).toEqual(['cs_test_1']);
    expect(requests.map((r) => r.pass ?? 'free')).toEqual([token, fresh, 'free']);
    expect(passes.pass()?.usable).toBe(false);
    expect(document.querySelector('[data-doc-error]')?.textContent).not.toContain(
      '¿Ya has pagado?',
    );
  });

  it('a refused pass that cannot be fetched again keeps the downloads but reads no more', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    const { passes, requests } = setUp({ ok: false, code: 'pass_invalid' });
    passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
    choose([photo]);
    await submit();
    const stored = passes.pass();
    expect(stored?.usable).toBe(false);
    expect(canDownload(passState(stored, NOW))).toBe(true);
    expect(document.querySelector('[data-doc-error]')?.textContent).toContain(
      'el informe y la carta siguen disponibles',
    );
    choose([photo]);
    await submit();
    expect(requests[1]).toHaveProperty('quota', null);
  });

  it('a pass Stripe could not confirm is kept as it was, with a try-again message', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    const { passes, requests } = setUp({ ok: false, code: 'pass_unconfirmed' });
    const held = { token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 };
    passes.savePass(held);
    choose([photo]);
    await submit();
    expect(requests[0]).toHaveProperty('pass', token);
    expect(passes.pass()).toEqual(held);
    expect(document.querySelector('[data-doc-error]')?.textContent).toBe(
      'No hemos podido comprobar tu pase ahora mismo. Prueba otra vez en un momento.',
    );
    choose([photo]);
    await submit();
    expect(requests[1]).toHaveProperty('pass', token);
  });

  it('a quota token the API refuses is forgotten', async () => {
    const { passes, requests } = setUp({ ok: false, code: 'invalid_request' });
    passes.saveQuota('v1.stale.quota');
    choose([photo]);
    await submit();
    expect(requests[0]).toHaveProperty('quota', 'v1.stale.quota');
    expect(passes.quota()).toBeNull();
  });

  it('an API error is worded, and the manual path stays one click away', async () => {
    const { events, form } = setUp({ ok: false, code: 'daily_limit_reached' });
    choose([photo]);
    await submit();
    const slip = document.querySelector<HTMLElement>('[data-doc-error]');
    expect(slip?.hidden).toBe(false);
    expect(slip?.textContent).toContain('Ya has usado las 2 lecturas gratis de hoy');
    expect(events.log).toContainEqual(['extractionFailed', 'daily_limit_reached']);
    expect(formEntries(form)).toEqual([]);
    click('[data-start-manual]');
    expect(form.hidden).toBe(false);
  });

  it('a captcha that cannot load is its own error, and nothing is sent', async () => {
    const { requests } = setUp(settlement, { captchaFails: true });
    choose([photo]);
    await submit();
    expect(requests).toHaveLength(0);
    expect(document.querySelector('[data-doc-error]')?.textContent).toContain(
      'No se ha podido cargar la comprobación',
    );
  });

  it('files accumulate across picks, and one can be removed before reading', async () => {
    const { requests } = setUp(settlement);
    const a = new File(['a'], 'carta.jpg', { type: 'image/jpeg' });
    const b = new File(['bb'], 'nomina.jpg', { type: 'image/jpeg' });
    const c = new File(['c'], 'certificado.jpg', { type: 'image/jpeg' });
    choose([a]);
    expect(text('[data-doc-files-status]')).toBe('Añadido: carta.jpg. Llevas 1 de 25.');
    pick([b, c]);
    expect(listed()).toHaveLength(3);
    expect(text('[data-doc-files-status]')).toBe('Añadidos 2 archivos. Llevas 3 de 25.');
    const remove = document.querySelector<HTMLElement>('[data-doc-remove="1"]');
    expect(remove?.getAttribute('aria-label')).toBe('Quitar nomina.jpg');
    remove?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(
      listed().map((t) => t?.startsWith('certificado.jpg') || t?.startsWith('carta.jpg')),
    ).toEqual([true, true]);
    expect(text('[data-doc-files-status]')).toBe('Quitado: nomina.jpg. Llevas 2 de 25.');
    expect(document.activeElement?.getAttribute('data-doc-remove')).toBe('1');
    await submit();
    expect(requests[0]?.files.map((f) => f.data)).toEqual([
      btoa('carta.jpg'),
      btoa('certificado.jpg'),
    ]);
    expect(listed()).toEqual([]);
  });

  it('turns each page of a PDF into an entry, and sends them as images', async () => {
    const { requests, events } = setUp(settlement);
    choose([new File(['3'], 'carta.pdf', { type: 'application/pdf' })]);
    await flush();
    expect([...document.querySelectorAll('.start__file-name')].map((n) => n.textContent)).toEqual([
      'carta.pdf, página 1',
      'carta.pdf, página 2',
      'carta.pdf, página 3',
    ]);
    expect(text('[data-doc-files-status]')).toBe('Añadido: carta.pdf. Páginas: 3. Llevas 3 de 25.');
    await submit();
    expect(requests[0]?.files).toEqual(
      [1, 2, 3].map((n) => ({ mediaType: 'image/jpeg', data: btoa(`carta.pdf#${n}`) })),
    );
    expect(events.log).toContainEqual(['uploadStarted', '2-4', 1]);
  });

  it('closes a PDF once its pages are encoded, and sends them again on a second try', async () => {
    const { closed, requests } = setUp({ ok: false, code: 'service_unavailable' });
    choose([new File(['2'], 'carta.pdf', { type: 'application/pdf' })]);
    await flush();
    await submit();
    expect(closed).toEqual(['carta.pdf']);
    await submit();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.files).toEqual(requests[0]?.files);
  });

  it('closes a PDF when its last page is removed', async () => {
    const { closed } = setUp(settlement);
    choose([new File(['2'], 'carta.pdf', { type: 'application/pdf' })]);
    await flush();
    document
      .querySelector<HTMLElement>('[data-doc-remove="0"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(closed).toEqual([]);
    document
      .querySelector<HTMLElement>('[data-doc-remove="0"]')
      ?.dispatchEvent(new Event('click', { bubbles: true }));
    expect(closed).toEqual(['carta.pdf']);
  });

  it('words a PDF whose page takes too long to draw', async () => {
    const { requests, closed } = setUp(settlement, { slowPages: true });
    choose([new File(['1'], 'escaneo.pdf', { type: 'application/pdf' })]);
    await flush();
    await submit();
    expect(requests).toEqual([]);
    expect(text('[data-doc-error]')).toBe(
      'Este PDF tarda demasiado en abrirse aquí. Sube fotos de sus páginas.',
    );
    expect(listed()).toEqual([]);
    expect(closed).toEqual(['escaneo.pdf']);
  });

  it('lets «Rellenar a mano» leave while a PDF is opening, and drops what comes late', async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { form, closed } = setUp(settlement, { pdfGate: gate });
    choose([new File(['3'], 'pesado.pdf', { type: 'application/pdf' })]);
    await flush();
    expect(text('[data-doc-status]')).toBe('Abriendo el PDF…');
    const manual = document.querySelector('[data-start-panel="upload"] [data-start-manual]');
    expect(manual?.getAttribute('aria-disabled')).toBe('false');
    expect(
      document
        .querySelector('[data-start-panel="upload"] [data-start-send]')
        ?.getAttribute('aria-disabled'),
    ).toBe('true');
    manual?.dispatchEvent(new Event('click'));
    expect(form.hidden).toBe(false);
    release();
    await flush();
    await flush();
    expect(listed()).toEqual([]);
    expect(closed).toEqual(['pesado.pdf']);
  });

  it('adds the pages of a PDF that fit, and says which', async () => {
    setUp(settlement);
    choose(
      Array.from({ length: 23 }, (_, i) => new File(['x'], `f${i}.jpg`, { type: 'image/jpeg' })),
    );
    pick([new File(['20'], 'vida-laboral.pdf', { type: 'application/pdf' })]);
    await flush();
    expect(listed()).toHaveLength(25);
    expect(text('[data-doc-files-status]')).toBe(
      'De vida-laboral.pdf caben las páginas 1 a 2 de 20: como mucho 25 fotos o páginas en total. Llevas 25 de 25.',
    );
  });

  it('words a PDF it cannot open', async () => {
    setUp(settlement);
    choose([new File(['1'], 'nomina-cifrado.pdf', { type: 'application/pdf' })]);
    await flush();
    expect(listed()).toEqual([]);
    expect(text('[data-doc-error-for="files"]')).toBe(
      'Este PDF está protegido con contraseña y no se puede abrir aquí. Sube fotos de sus páginas.',
    );
  });

  it('leaves out a file already chosen, and says so', () => {
    setUp(settlement);
    const a = new File(['a'], 'carta.jpg', { type: 'image/jpeg', lastModified: 1 });
    choose([a]);
    pick([new File(['a'], 'carta.jpg', { type: 'image/jpeg', lastModified: 1 })]);
    expect(listed()).toHaveLength(1);
    expect(text('[data-doc-files-status]')).toBe('Ya estaba añadido: carta.jpg.');
    expect(document.querySelector<HTMLElement>('[data-doc-error-for="files"]')?.hidden).toBe(true);
  });

  it('names each shot of the camera «Foto N»', () => {
    setUp(settlement);
    click('[data-start-panel="choose"] [data-start-upload]');
    // Every shot from the camera is «image.jpg»; its time tells it apart.
    let taken = 0;
    const shot = () =>
      new File(['x'], 'image.jpg', { type: 'image/jpeg', lastModified: (taken += 1) });
    pick([shot()], '#document-camera');
    pick([shot()], '#document-camera');
    expect([...document.querySelectorAll('.start__file-name')].map((n) => n.textContent)).toEqual([
      'Foto 1',
      'Foto 2',
    ]);
  });

  it('leaves out the 26th image, saying how many and why', async () => {
    const { requests } = setUp(settlement);
    choose(
      Array.from({ length: 26 }, (_, i) => new File(['x'], `f${i}.jpg`, { type: 'image/jpeg' })),
    );
    expect(listed()).toHaveLength(25);
    expect(text('[data-doc-files-status]')).toBe(
      'Añadidos 25 archivos. Llevas 25 de 25. 1 archivo no se ha añadido.',
    );
    expect(text('[data-doc-error-for="files"]')).toBe(
      'Como mucho 25 fotos o páginas de PDF en total',
    );
    await submit();
    expect(requests[0]?.files).toHaveLength(25);
  });

  it('shares the request equally among the photos and the pages of a PDF', async () => {
    const { shares } = setUp(settlement);
    const photos = Array.from(
      { length: 12 },
      (_, i) => new File(['x'], `pagina-${i}.jpg`, { type: 'image/jpeg' }),
    );
    choose([...photos, new File(['3'], 'carta.pdf', { type: 'application/pdf' })]);
    await flush();
    await submit();
    expect(shares).toHaveLength(15);
    // Each image gets its share of what is left, so the first one sets the floor.
    expect(shares[0]).toBeGreaterThan(280_000);
    expect(shares[0]).toBeLessThan(420_000);
  });

  it('says what it recognised and where the documents disagree', async () => {
    setUp({
      ...settlement,
      failedChecks: [],
      extraction: {
        ...settlement.extraction,
        documents: [
          { kind: 'dismissal_letter', pages: 6 },
          { kind: 'payslip', pages: 1, month: '2026-08' },
          { kind: 'company_certificate', pages: 1 },
          { kind: 'other', pages: 1 },
        ],
        conflicts: [{ field: 'endDate', sources: ['settlement_proposal', 'dismissal_letter'] }],
      },
    } as ExtractResult);
    choose([photo]);
    await submit();
    expect(text('[data-done-documents]')).toBe(
      'Carta de despido (6 páginas) · Nómina de agosto · Certificado de empresa · 1 página sin datos útiles',
    );
    expect(text('[data-done-notes]')).toContain(
      'Fecha de baja: los documentos no dicen lo mismo. Se ha usado lo que pone la propuesta de finiquito; compáralo con los demás.',
    );
  });

  it('shows what an uploaded agreement offers beside the severance, until the form restarts', async () => {
    const { upload, form } = setUp({
      ...settlement,
      extraction: {
        ...settlement.extraction,
        documents: [{ kind: 'settlement_agreement', pages: 2 }],
        fields: {
          agreementSeveranceTotal: {
            value: 8000,
            confidence: 'high',
            source: 'settlement_agreement',
          },
        },
      },
    } as ExtractResult);
    choose([photo]);
    await submit();
    const result = document.createElement('div');
    result.innerHTML = '<section data-item="severance"><p data-reference></p></section>';
    upload.showAgreementOffer(result);
    upload.showAgreementOffer(result);
    const notes = result.querySelectorAll('[data-agreement-offer]');
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent?.replace(/\s/g, ' ')).toBe(
      'El acuerdo que has subido ofrece 8.000,00 € en total.',
    );
    expect(notes[0]?.previousElementSibling?.hasAttribute('data-reference')).toBe(true);
    expect(formEntries(form)).toEqual([]);
    form.dispatchEvent(new Event('reset'));
    upload.showAgreementOffer(result);
    expect(result.querySelector('[data-agreement-offer]')).toBeNull();
  });

  it('a read that found nothing says why for each file, keeps them, and spends no read', async () => {
    const { events, store, passes, requests } = setUp({
      ok: false,
      code: 'nothing_read',
      pages: [
        { page: 1, kind: 'payslip', readability: 'blurry' },
        { page: 2, kind: 'other', readability: 'foreign_jurisdiction' },
        { page: 3, kind: 'other', readability: 'ok' },
      ],
    });
    passes.saveQuota('v1.quota.kept');
    const files = ['nomina.jpg', 'contrato-lisboa.jpg', 'irpf.jpg', 'manuscrito.jpg'].map(
      (name) => new File(['x'], name, { type: 'image/jpeg' }),
    );
    choose(files);
    await submit();
    expect(requests).toHaveLength(1);
    const review = document.querySelector<HTMLElement>('[data-doc-review]');
    expect(review?.hidden).toBe(false);
    expect(text('[data-doc-review-lead]')).toBe(
      'No se ha leído ningún dato, así que esta lectura no cuenta. Puedes cambiar las fotos o páginas que fallan y volver a probar, o rellenar a mano.',
    );
    expect(
      [...document.querySelectorAll('[data-doc-review-list] li')].map((li) => li.textContent),
    ).toEqual([
      'nomina.jpg: sale borrosa. Prueba con más luz y el móvil quieto.',
      'contrato-lisboa.jpg: es de otro país. Esta revisión aplica la ley española.',
      'irpf.jpg: no trae datos que use esta revisión.',
      'manuscrito.jpg: no se ha podido leer.',
    ]);
    expect(document.querySelector<HTMLElement>('[data-doc-review-actions]')?.hidden).toBe(true);
    expect(document.activeElement).toBe(document.querySelector('[data-doc-review-lead]'));
    expect(listed()).toHaveLength(4);
    expect(store.get('eslojusto-lecturas')).toBe('v1.quota.kept');
    expect(events.log).toContainEqual([
      'nothingRead',
      ['blurry', 'foreign_jurisdiction', 'no_data', 'unread'],
      '2-4',
      0,
    ]);
    expect(events.log.map(([name]) => name)).not.toContain('extractionFailed');
    expect(
      document
        .querySelector('[data-start-panel="upload"] [data-start-manual]')
        ?.getAttribute('aria-disabled'),
    ).toBe('false');
    // Changing the files clears what was said about the old ones.
    document.querySelector<HTMLElement>('[data-doc-remove="0"]')?.click();
    expect(review?.hidden).toBe(true);
  });

  it('a read that skipped pages says which and why beside what it read', async () => {
    const { events } = setUp({
      ...settlement,
      extraction: {
        ...settlement.extraction,
        pages: [
          { page: 1, kind: 'settlement_proposal', readability: 'ok' },
          { page: 2, kind: 'payslip', readability: 'handwritten' },
        ],
      },
    });
    const second = new File(['y'], 'nomina-a-mano.jpg', { type: 'image/jpeg' });
    const third = new File(['z'], 'reverso.jpg', { type: 'image/jpeg' });
    choose([photo, second, third]);
    await submit();
    const notes = [...document.querySelectorAll('[data-done-notes] li')].map(
      (li) => li.textContent,
    );
    expect(notes.slice(0, 2)).toEqual([
      'Se ha saltado nomina-a-mano.jpg: parece escrito a mano. Es mejor que escribas los datos tú.',
      'Se ha saltado reverso.jpg: no se ha podido leer.',
    ]);
    expect(events.log.at(-1)).toEqual([
      'extractionCompleted',
      expect.objectContaining({ skippedReasons: ['handwritten', 'unread'] }),
    ]);
  });

  it('warns before sending a photo that looks dark, and sends it if asked to', async () => {
    const { events, requests } = setUp(settlement);
    choose([photo, new File(['o'], 'oscura.jpg', { type: 'image/jpeg' })]);
    await submit();
    expect(requests).toHaveLength(0);
    expect(
      [...document.querySelectorAll('[data-doc-review-list] li')].map((li) => li.textContent),
    ).toEqual(['oscura.jpg se ve muy oscura.']);
    expect(text('[data-doc-review-ask]')).toBe('¿La repites?');
    expect(document.querySelector<HTMLElement>('[data-doc-review-actions]')?.hidden).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('[data-doc-review-ask]'));
    expect(events.log).toContainEqual(['qualityWarned', 'dark']);
    click('[data-doc-send-anyway]');
    await flush();
    await flush();
    expect(requests).toHaveLength(1);
    expect(requests[0]?.files).toHaveLength(2);
    expect(events.log).toContainEqual(['qualityOverridden']);
    expect(document.querySelector<HTMLElement>('[data-doc-review]')?.hidden).toBe(true);
  });

  it('«Repetir» takes the flagged photos out of the list and sends nothing', async () => {
    const { events, requests } = setUp(settlement);
    choose([
      new File(['b'], 'borrosa.jpg', { type: 'image/jpeg' }),
      photo,
      new File(['p'], 'pequena.jpg', { type: 'image/jpeg' }),
    ]);
    await submit();
    expect(
      [...document.querySelectorAll('[data-doc-review-list] li')].map((li) => li.textContent),
    ).toEqual([
      'borrosa.jpg se ve borrosa.',
      'pequena.jpg es muy pequeña: puede que la letra no se lea.',
    ]);
    expect(text('[data-doc-review-ask]')).toBe('¿Las repites?');
    expect(events.log.filter(([name]) => name === 'qualityWarned')).toEqual([
      ['qualityWarned', 'blurry'],
      ['qualityWarned', 'small'],
    ]);
    click('[data-doc-retake]');
    expect(listed()).toEqual(['finiquito.jpg1 KBQuitar']);
    expect(text('[data-doc-files-status]')).toBe(
      'Quitado: borrosa.jpg, pequena.jpg. Llevas 1 de 25.',
    );
    expect(document.activeElement?.id).toBe('document-files');
    expect(requests).toHaveLength(0);
    expect(events.log.map(([name]) => name)).not.toContain('qualityOverridden');
  });

  it('never warns about the pages of a PDF, which are drawn, not photographed', async () => {
    const { requests, events } = setUp(settlement);
    choose([new File(['2'], 'oscura.pdf', { type: 'application/pdf' })]);
    await flush();
    await submit();
    expect(requests).toHaveLength(1);
    expect(events.log.map(([name]) => name)).not.toContain('qualityWarned');
  });

  it('once reading is unavailable, the start sheet offers only the manual path for an hour', async () => {
    const { outage, session, store } = setUp({ ok: false, code: 'model_unavailable' });
    choose([photo]);
    await submit();
    expect(text('[data-doc-error]')).toContain('La lectura no está disponible ahora mismo');
    expect(outage.active()).toBe(true);
    expect(session.get('eslojusto-lectura-no-disponible')).toBe(String(NOW));
    expect(store.get('eslojusto-lecturas')).toBeNull();
    click('[data-start-back]');
    const choice = document.querySelector<HTMLElement>(
      '[data-start-panel="choose"] [data-start-upload]',
    );
    expect(choice?.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('[data-start-unavailable]')?.hidden).toBe(false);
  });
});
