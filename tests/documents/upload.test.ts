// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { formEntries, setEntry } from '../../src/calculator/fill';
import type { Api, ExtractRequest, ExtractResult } from '../../src/documents/contract';
import { createPassStore } from '../../src/documents/pass';
import { setUpUpload } from '../../src/documents/upload';
import { START, flush, recordingEvents } from './dom';
import { memoryStore, passToken, tr } from './fixtures';

const NOW = Date.UTC(2026, 9, 7);

function setUp(result: ExtractResult, options: { captchaFails?: boolean } = {}) {
  document.body.innerHTML = START;
  const store = memoryStore();
  const passes = createPassStore(store);
  const events = recordingEvents();
  const requests: ExtractRequest[] = [];
  const opened: number[] = [];
  const form = document.querySelector<HTMLFormElement>('#calculator') as HTMLFormElement;
  const api: Api = {
    extract: async (r) => {
      requests.push(r);
      return result;
    },
    checkout: async () => ({ ok: false, code: 'service_unavailable' }),
    pass: async () => ({ ok: false, code: 'service_unavailable' }),
  };
  const upload = setUpUpload(document.querySelector('[data-documents-start]') as HTMLElement, {
    api,
    captcha: {
      token: () =>
        options.captchaFails ? Promise.reject(new Error('blocked')) : Promise.resolve('captcha'),
    },
    encoder: {
      encode: async (f) => ({ mediaType: 'image/jpeg', data: btoa(f.name), bytes: f.size }),
    },
    passes,
    events,
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
  return { upload, store, passes, events, requests, opened, form };
}

const click = (selector: string) =>
  document.querySelector<HTMLElement>(selector)?.dispatchEvent(new Event('click'));

function choose(files: File[], { kind = true, consent = true } = {}) {
  click('[data-start-panel="choose"] [data-start-upload]');
  if (kind) (document.querySelector('#document-settlement') as HTMLInputElement).checked = true;
  (document.querySelector('#document-consent') as HTMLInputElement).checked = consent;
  const input = document.querySelector('#document-files') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}

const submit = async () => {
  document
    .querySelector('[data-start-panel="upload"]')
    ?.dispatchEvent(new Event('submit', { cancelable: true }));
  await flush();
  await flush();
};

const photo = new File(['x'], 'finiquito.jpg', { type: 'image/jpeg' });
const settlement: ExtractResult = {
  ok: true,
  extraction: {
    kind: 'settlement',
    fields: {
      cause: { value: 'unfair_dismissal', confidence: 'high' },
      startDate: { value: '2010-03-01', confidence: 'medium' },
      severance: { value: 40000, confidence: 'low' },
    },
    lists: {},
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

  it('asks for the kind, a file and the consent before sending anything', async () => {
    const { requests } = setUp(settlement);
    choose([], { kind: false, consent: false });
    await submit();
    expect(requests).toHaveLength(0);
    const slip = (f: string) => document.querySelector(`[data-doc-error-for="${f}"]`)?.textContent;
    expect(slip('kind')).toBe('Elige qué documento es');
    expect(slip('files')).toBe('Elige al menos una foto o un PDF');
    expect(slip('consent')).toBe('Para leer el documento hace falta tu consentimiento');
    expect(document.activeElement?.id).toBe('document-settlement');
  });

  it('reads a document: fills the form, marks each field and keeps the next quota', async () => {
    const { requests, store, form, events } = setUp(settlement);
    choose([photo]);
    await submit();
    expect(requests).toEqual([
      {
        kind: 'settlement',
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
      ['uploadStarted', 'settlement', 1, 'image'],
      ['extractionCompleted', 'settlement', 3, true, true, true],
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

  it('an invalid or expired pass is forgotten, so the next read is a free one', async () => {
    const token = passToken({ typ: 'pass', sid: 'cs_test_1', exp: NOW / 1000 + 3600 });
    for (const code of ['pass_invalid', 'pass_expired'] as const) {
      const { passes, requests } = setUp({ ok: false, code });
      passes.savePass({ token, expiresAt: NOW / 1000 + 3600, readsLeft: 5 });
      choose([photo]);
      await submit();
      expect(passes.pass(), code).toBeNull();
      expect(document.querySelector('[data-doc-error]')?.textContent).toContain('lectura gratis');
      choose([photo]);
      await submit();
      expect(requests[1], code).toHaveProperty('quota', null);
    }
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
    expect(events.log).toContainEqual(['extractionFailed', 'settlement', 'daily_limit_reached']);
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

  it('two photos and a PDF are refused before any request', async () => {
    const { requests } = setUp(settlement);
    const pdf = new File(['%PDF-'], 'f.pdf', { type: 'application/pdf' });
    choose([photo, pdf]);
    await submit();
    expect(requests).toHaveLength(0);
    expect(document.querySelector('[data-doc-error-for="files"]')?.textContent).toBe(
      'Sube fotos o un PDF, pero no los dos a la vez',
    );
  });
});
