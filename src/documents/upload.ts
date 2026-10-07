import type { Calculator } from '../calculator/main';
import type { FormEntries } from '../calculator/fill';
import { required } from '../calculator/dom';
import { formatInteger } from '../calculator/number';
import type { Translate } from '../i18n/client';
import {
  LIMITS,
  type Api,
  type CoherenceCheck,
  type Confidence,
  type DocumentKind,
  type ErrorCode,
} from './contract';
import { checkSelection, mediaOf, requestBytes } from './files';
import { passClaims, passState, type PassStore, type StoredPass } from './pass';
import type { Captcha, DocumentEvents, EncodedFile, FileEncoder } from './ports';
import { hasLowConfidence, prefillFrom, prefilledCount, type Prefill } from './prefill';

export interface UploadDeps {
  readonly api: Api;
  readonly captcha: Captcha;
  readonly encoder: FileEncoder;
  readonly passes: PassStore;
  readonly events: DocumentEvents;
  readonly now: () => number;
  readonly tr: Translate;
  readonly calculator: Pick<Calculator, 'form' | 'fill' | 'open' | 'entries'>;
  // The section tabs, hidden while the start sheet is open.
  readonly tabs: HTMLElement | null;
}

type Panel = 'choose' | 'upload' | 'done';
type LocalError = 'kind_missing' | 'consent_missing';

const KIB = 1024;
const sizeText = (bytes: number) =>
  bytes < KIB * KIB
    ? `${formatInteger(Math.max(1, Math.round(bytes / KIB)))} KB`
    : `${(bytes / KIB / KIB).toLocaleString('es-ES', { maximumFractionDigits: 1 })} MB`;

// The prefill as form answers. «Otros trabajos» rows take the place of any typed before.
export function prefillEntries(p: Prefill): FormEntries {
  const entries: [string, string][] = p.fields.map((f) => [f.name, f.value]);
  if (p.otherContracts && p.otherContracts.length > 0) {
    entries.push(['otherContracts', 'yes']);
    p.otherContracts.forEach((c, i) => {
      entries.push([`otherContracts.${i}.startDate`, c.startDate]);
      entries.push([`otherContracts.${i}.endDate`, c.endDate]);
    });
  }
  return entries;
}

// «Leído del documento · confianza alta» under a field, also read out with it.
function addMark(container: HTMLElement, id: string, text: string, confidence: Confidence) {
  container.querySelector(`[data-read-mark="${id}"]`)?.remove();
  const mark = document.createElement('p');
  mark.className = 'read-mark';
  mark.id = `read-${id.replace(/\W/g, '-')}`;
  mark.dataset['readMark'] = id;
  mark.dataset['confidence'] = confidence;
  mark.textContent = text;
  const slip = container.querySelector(':scope > .errata, :scope > [data-row-error]');
  if (slip) slip.before(mark);
  else container.append(mark);
  for (const input of container.querySelectorAll<HTMLInputElement>('input')) {
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    if (!ids.includes(mark.id)) input.setAttribute('aria-describedby', [...ids, mark.id].join(' '));
  }
}

function removeMark(mark: Element) {
  const container = mark.parentElement;
  for (const input of container?.querySelectorAll<HTMLInputElement>('input') ?? []) {
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    input.setAttribute('aria-describedby', ids.filter((i) => i !== mark.id).join(' '));
  }
  mark.remove();
}

export function setUpUpload(start: HTMLElement, deps: UploadDeps) {
  const { api, captcha, encoder, passes, events, tr, calculator } = deps;
  const { form } = calculator;
  const panels = {
    choose: required(start.querySelector<HTMLElement>('[data-start-panel="choose"]'), 'choose'),
    upload: required(start.querySelector<HTMLFormElement>('[data-start-panel="upload"]'), 'upload'),
    done: required(start.querySelector<HTMLElement>('[data-start-panel="done"]'), 'done'),
  };
  const upload = panels.upload;
  const fileInput = required(upload.querySelector<HTMLInputElement>('#document-files'), 'files');
  const fileList = required(upload.querySelector<HTMLElement>('[data-doc-files]'), 'file list');
  const consent = required(upload.querySelector<HTMLInputElement>('#document-consent'), 'consent');
  const status = required(upload.querySelector<HTMLElement>('[data-doc-status]'), 'status');
  const errorSlip = required(upload.querySelector<HTMLElement>('[data-doc-error]'), 'error');
  const summary = required(panels.done.querySelector<HTMLElement>('[data-done-summary]'), 'sum');
  const notes = required(panels.done.querySelector<HTMLElement>('[data-done-notes]'), 'notes');
  let busy = false;

  function show(panel: Panel, focus = true) {
    for (const [name, el] of Object.entries(panels)) el.hidden = name !== panel;
    if (focus) panels[panel].querySelector<HTMLElement>('.question')?.focus();
  }

  // Leaves the start sheet for the calculator; `open` starts it at its first sheet.
  function showCalculator(open: boolean) {
    start.hidden = true;
    form.hidden = false;
    if (deps.tabs) deps.tabs.hidden = false;
    if (open) calculator.open();
  }

  function fieldError(field: 'kind' | 'files' | 'consent', code: ErrorCode | LocalError | null) {
    const slip = upload.querySelector<HTMLElement>(`[data-doc-error-for="${field}"]`);
    if (!slip) return;
    slip.hidden = code === null;
    slip.textContent = code === null ? '' : tr(`client.documents.error.${code}`);
    const inputs = upload.querySelectorAll(`[data-doc-field="${field}"] input`);
    for (const input of inputs)
      if (code === null) input.removeAttribute('aria-invalid');
      else input.setAttribute('aria-invalid', 'true');
  }

  function setError(code: ErrorCode | null) {
    errorSlip.hidden = code === null;
    errorSlip.textContent = code === null ? '' : tr(`client.documents.error.${code}`);
  }

  function setBusy(on: boolean, message: string) {
    busy = on;
    status.textContent = message;
    // While a read is on its way, leaving for the form would let a late answer overwrite it.
    for (const button of upload.querySelectorAll(
      '[data-start-send], [data-start-manual], [data-start-back]',
    ))
      button.setAttribute('aria-disabled', String(on));
    upload.setAttribute('aria-busy', String(on));
  }

  function listFiles() {
    const files = [...(fileInput.files ?? [])];
    fileList.hidden = files.length === 0;
    fileList.replaceChildren(
      ...files.map((f) => {
        const li = document.createElement('li');
        li.textContent = tr('client.documents.file', { nombre: f.name, tamano: sizeText(f.size) });
        return li;
      }),
    );
    fieldError('files', null);
    setError(null);
  }

  function markForm(p: Prefill) {
    const label = (c: Confidence, derived = false) =>
      tr(derived ? 'client.documents.mark_derived' : 'client.documents.mark', {
        nivel: tr(`client.documents.confidence.${c}`),
      }) + (c === 'low' ? tr('client.documents.mark_low') : '');
    for (const f of p.fields) {
      const container = form.querySelector<HTMLElement>(`[data-field="${f.name}"]`);
      if (container) addMark(container, f.name, label(f.confidence, f.derived), f.confidence);
    }
    p.otherContracts?.forEach((c, i) => {
      const row = form.querySelector<HTMLElement>(`[data-other-contract="${i}"] fieldset`);
      if (row) addMark(row, `otherContracts.${i}`, label(c.confidence), c.confidence);
    });
  }

  function showDone(p: Prefill, checks: readonly CoherenceCheck[]) {
    const n = prefilledCount(p);
    summary.textContent =
      n === 0 ? tr('client.documents.done_none') : tr('client.documents.done', { n });
    const lines = [
      ...(hasLowConfidence(p) ? [tr('client.documents.done_low')] : []),
      ...checks.map((c) => tr(`client.documents.check.${c}`)),
    ];
    notes.hidden = lines.length === 0;
    notes.replaceChildren(
      ...lines.map((line) => {
        const li = document.createElement('li');
        li.textContent = line;
        return li;
      }),
    );
    show('done');
  }

  function validate(): { kind: DocumentKind; files: File[] } | null {
    const kind = new FormData(upload).get('documentKind') as DocumentKind | null;
    const files = [...(fileInput.files ?? [])];
    const fileProblem = checkSelection(files);
    fieldError('kind', kind ? null : 'kind_missing');
    fieldError('files', fileProblem);
    fieldError('consent', consent.checked ? null : 'consent_missing');
    const invalid = upload.querySelector<HTMLInputElement>('[aria-invalid="true"]');
    if (invalid || !kind) {
      invalid?.focus();
      return null;
    }
    return { kind, files };
  }

  // A paid pass the API refuses (its signing key may have changed) is asked for once more with
  // the payment it came from; true when that gave a different one. Only once per pass.
  async function fetchPassAgain(refused: StoredPass): Promise<boolean> {
    if (refused.renewed) return false;
    const claims = passClaims(refused.token);
    const checkout = passes
      .checkouts()
      .find((c) => c.redeemed && c.sessionId === claims?.sessionId);
    if (!checkout) return false;
    const again = await api.pass(checkout.sessionId, checkout.nonce);
    // The same token back would only be refused again.
    if (!again.ok || again.pass === refused.token) return false;
    passes.savePass({
      token: again.pass,
      expiresAt: again.expiresAt,
      readsLeft: again.readsLeft,
      renewed: true,
    });
    passes.markRedeemed(checkout.sessionId, again.expiresAt);
    return true;
  }

  async function read(kind: DocumentKind, files: File[]) {
    setBusy(true, tr('client.documents.status.preparing'));
    const fail = (code: ErrorCode) => {
      events.extractionFailed(kind, code);
      setBusy(false, '');
      setError(code);
    };
    let encoded: EncodedFile[];
    try {
      encoded = [];
      for (const file of files) encoded.push(await encoder.encode(file));
    } catch {
      return fail('image_unreadable');
    }
    if (requestBytes(encoded) > LIMITS.maxPayloadBytes) return fail('payload_too_large');

    setBusy(true, tr('client.documents.status.captcha'));
    let captchaToken: string;
    try {
      captchaToken = await captcha.token();
    } catch {
      return fail('captcha_unavailable');
    }

    const stored = passes.pass();
    const usePass = stored !== null && passState(stored, deps.now()) === 'valid';
    events.uploadStarted(kind, files.length, mediaOf(files));
    setBusy(true, tr('client.documents.status.reading'));
    const result = await api.extract({
      kind,
      files: encoded.map(({ mediaType, data }) => ({ mediaType, data })),
      captchaToken,
      ...(usePass ? { pass: stored.token } : { quota: passes.quota() }),
    });
    if (!result.ok) {
      // The server has the last word on what was sent: a pass it no longer honours is dropped, so
      // the next read is a free one, and so is a quota token it refuses.
      if (usePass && result.code === 'pass_exhausted') passes.updateReads(0);
      if (usePass && result.code === 'pass_invalid') {
        if (await fetchPassAgain(stored)) {
          events.extractionFailed(kind, result.code);
          setBusy(false, tr('client.documents.pass.renewed'));
          return;
        }
        passes.retirePass();
      }
      if (usePass && ['pass_revoked', 'pass_expired'].includes(result.code)) passes.forgetPass();
      if (!usePass && result.code === 'invalid_request' && passes.quota() !== null)
        passes.forgetQuota();
      return fail(result.code);
    }
    if (usePass && result.readsLeft !== null) passes.updateReads(result.readsLeft);
    if (!usePass && result.allowance !== null) passes.saveQuota(result.allowance);

    const current = Object.fromEntries(calculator.entries());
    const prefill = prefillFrom(result.extraction, {
      ...(current['startDate'] ? { startDate: current['startDate'] } : {}),
      ...(current['endDate'] ? { endDate: current['endDate'] } : {}),
    });
    calculator.fill(prefillEntries(prefill));
    markForm(prefill);
    events.extractionCompleted(
      kind,
      prefilledCount(prefill),
      hasLowConfidence(prefill),
      result.failedChecks.length > 0,
      result.escalated,
    );
    setBusy(false, '');
    upload.reset();
    listFiles();
    showDone(prefill, result.failedChecks);
  }

  upload.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const valid = validate();
    if (valid) void read(valid.kind, valid.files);
  });
  fileInput.addEventListener('change', listFiles);
  consent.addEventListener('change', () => fieldError('consent', null));
  upload.addEventListener('change', (e) => {
    if (e.target instanceof HTMLInputElement && e.target.name === 'documentKind')
      fieldError('kind', null);
  });

  for (const button of start.querySelectorAll('[data-start-upload]'))
    button.addEventListener('click', () => {
      if (!panels.choose.hidden) events.startChosen('upload');
      show('upload');
    });
  for (const button of start.querySelectorAll('[data-start-manual]'))
    button.addEventListener('click', () => {
      if (busy) return;
      events.startChosen('manual');
      showCalculator(true);
    });
  start
    .querySelector('[data-start-back]')
    ?.addEventListener('click', () => !busy && show('choose'));
  start
    .querySelector('[data-start-continue]')
    ?.addEventListener('click', () => showCalculator(true));

  // A mark tells where a value came from; once the person changes the value, it no longer applies.
  const unmark = (e: Event) => {
    const input = e.target instanceof HTMLInputElement ? e.target : null;
    if (!input) return;
    const container = input.closest('[data-field], [data-other-contract] fieldset');
    for (const mark of container?.querySelectorAll(':scope > [data-read-mark]') ?? [])
      removeMark(mark);
  };
  form.addEventListener('input', unmark);
  form.addEventListener('change', unmark);
  form.addEventListener('reset', () => {
    for (const mark of form.querySelectorAll('[data-read-mark]')) removeMark(mark);
  });

  const startStatus = panels.choose.querySelector<HTMLElement>('[data-start-status]');

  return {
    showCalculator,
    // A message on the start sheet, such as the outcome of a payment with no review to show.
    notice(text: string) {
      if (startStatus) startStatus.textContent = text;
    },
    // Opens on the choice between uploading and typing.
    showStart(focus = false) {
      start.hidden = false;
      form.hidden = true;
      if (deps.tabs) deps.tabs.hidden = true;
      show('choose', focus);
    },
  };
}
