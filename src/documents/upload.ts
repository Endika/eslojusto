import type { Calculator } from '../calculator/main';
import type { FormEntries } from '../calculator/fill';
import { required } from '../calculator/dom';
import { formatEuros, formatInteger } from '../calculator/number';
import type { Translate } from '../i18n/client';
import {
  LIMITS,
  type Api,
  type CoherenceCheck,
  type Confidence,
  type ErrorCode,
  type Extraction,
} from './contract';
import { admit, checkSelection, filesBucket, photoShare, requestBytes } from './files';
import type { OutageMemory } from './outage';
import { passClaims, passState, type PassStore, type StoredPass } from './pass';
import { qualityProblem, type QualityProblem } from './quality';
import { reasonsOf, skippedLines, skippedPages } from './skipped';
import type {
  Captcha,
  DocumentEvents,
  EncodedFile,
  FileEncoder,
  OpenedPdf,
  PdfPages,
  PdfProblem,
} from './ports';
import {
  hasHolidayDays,
  hasLowConfidence,
  prefillFrom,
  prefilledCount,
  type Prefill,
} from './prefill';
import { conflictLines, recognisedLine } from './summary';

export interface UploadDeps {
  readonly api: Api;
  readonly captcha: Captcha;
  readonly encoder: FileEncoder;
  // Loads pdf.js the first time a PDF is picked.
  readonly pdfs: PdfPages;
  readonly passes: PassStore;
  readonly events: DocumentEvents;
  // Remembers, for an hour, that reading answered `model_unavailable`.
  readonly outage: OutageMemory;
  readonly now: () => number;
  readonly tr: Translate;
  readonly calculator: Pick<Calculator, 'form' | 'fill' | 'open' | 'entries'>;
  // The section tabs, hidden while the start sheet is open.
  readonly tabs: HTMLElement | null;
}

type Panel = 'choose' | 'upload' | 'done';
type LocalError = 'consent_missing';

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
  const { api, captcha, encoder, passes, events, outage, tr, calculator } = deps;
  const { form } = calculator;
  const panels = {
    choose: required(start.querySelector<HTMLElement>('[data-start-panel="choose"]'), 'choose'),
    upload: required(start.querySelector<HTMLFormElement>('[data-start-panel="upload"]'), 'upload'),
    done: required(start.querySelector<HTMLElement>('[data-start-panel="done"]'), 'done'),
  };
  const upload = panels.upload;
  const fileInput = required(upload.querySelector<HTMLInputElement>('#document-files'), 'files');
  const cameraInput = upload.querySelector<HTMLInputElement>('#document-camera');
  const fileList = required(upload.querySelector<HTMLElement>('[data-doc-files]'), 'file list');
  const fileStatus = required(
    upload.querySelector<HTMLElement>('[data-doc-files-status]'),
    'file status',
  );
  const consent = required(upload.querySelector<HTMLInputElement>('#document-consent'), 'consent');
  const status = required(upload.querySelector<HTMLElement>('[data-doc-status]'), 'status');
  const errorSlip = required(upload.querySelector<HTMLElement>('[data-doc-error]'), 'error');
  const review = required(upload.querySelector<HTMLElement>('[data-doc-review]'), 'review');
  const reviewPart = (name: string) =>
    required(review.querySelector<HTMLElement>(`[data-doc-review-${name}]`), name);
  const [reviewLead, reviewList, reviewAsk, reviewActions] = ['lead', 'list', 'ask', 'actions'].map(
    reviewPart,
  ) as [HTMLElement, HTMLElement, HTMLElement, HTMLElement];
  const recognised = panels.done.querySelector<HTMLElement>('[data-done-documents]');
  const summary = required(panels.done.querySelector<HTMLElement>('[data-done-summary]'), 'sum');
  const notes = required(panels.done.querySelector<HTMLElement>('[data-done-notes]'), 'notes');
  const uploadChoice = panels.choose.querySelector<HTMLElement>('[data-start-upload]');
  const unavailableNote = panels.choose.querySelector<HTMLElement>('[data-start-unavailable]');
  let busy = false;
  // While files are opened, drawn and encoded, nothing has left the page yet: «Rellenar a mano»
  // stays usable and abandons the work, whose late results are then dropped.
  let preparing = false;
  let generation = 0;

  // The pages chosen so far, in the order they were added: each pick, drop or photo adds to them,
  // and a PDF adds one entry per page.
  interface Picked {
    readonly file: File;
    readonly name: string;
    readonly thumbnail: string | null;
    readonly pdf?: { readonly opened: OpenedPdf; readonly page: number };
  }
  let picked: Picked[] = [];
  const encodedPages = new Map<Picked, EncodedFile>();
  let photos = 0;
  // The photos the last quality warning was about, for «Repetir».
  let flagged: Picked[] = [];
  // What an uploaded agreement offers as severance, from the last read, until the form restarts.
  let agreementOffer: number | null = null;

  function show(panel: Panel, focus = true) {
    for (const [name, el] of Object.entries(panels)) el.hidden = name !== panel;
    if (focus) panels[panel].querySelector<HTMLElement>('.question')?.focus();
  }

  // While reading is known to be down, the start sheet offers only the manual path.
  function applyOutage() {
    const down = outage.active();
    if (uploadChoice) uploadChoice.hidden = down;
    if (unavailableNote) unavailableNote.hidden = !down;
  }

  // Leaves the start sheet for the calculator; `open` starts it at its first sheet.
  function showCalculator(open: boolean) {
    start.hidden = true;
    form.hidden = false;
    if (deps.tabs) deps.tabs.hidden = false;
    if (open) calculator.open();
  }

  function fieldError(field: 'files' | 'consent', code: ErrorCode | LocalError | null) {
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

  // A message about the files themselves: why a read found nothing, or which photos look like
  // they will read badly, with the choice to take them again or send them as they are.
  function showReview(lead: string, lines: readonly string[], ask: string) {
    reviewLead.textContent = lead;
    reviewAsk.textContent = ask;
    reviewList.replaceChildren(
      ...lines.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      }),
    );
    reviewActions.hidden = ask === '';
    review.hidden = false;
    (lead ? reviewLead : reviewAsk).focus();
  }

  function hideReview() {
    review.hidden = true;
    flagged = [];
  }

  function setBusy(on: boolean, message: string, preparation = false) {
    busy = on;
    preparing = on && preparation;
    status.textContent = message;
    // While a read is on its way, leaving for the form would let a late answer overwrite it, and
    // changing the files would make the answer about other ones.
    for (const button of upload.querySelectorAll(
      '[data-start-send], [data-start-back], [data-doc-remove]',
    ))
      button.setAttribute('aria-disabled', String(on));
    for (const button of upload.querySelectorAll('[data-start-manual]'))
      button.setAttribute('aria-disabled', String(on && !preparing));
    for (const input of [fileInput, cameraInput]) if (input) input.disabled = on;
    upload.setAttribute('aria-busy', String(on));
  }

  function fileItem(p: Picked, index: number): HTMLLIElement {
    const li = document.createElement('li');
    li.className = 'start__file';
    if (p.thumbnail) {
      const img = document.createElement('img');
      img.className = 'start__thumb';
      img.alt = '';
      img.src = p.thumbnail;
      // A photo the browser can't show (HEIC in most) keeps an empty square.
      img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
      li.append(img);
    } else li.append(placeholder(p.pdf ? 'PDF' : ''));
    const text = document.createElement('span');
    const name = document.createElement('span');
    name.className = 'start__file-name';
    name.textContent = p.name;
    const size = document.createElement('span');
    size.className = 'start__file-size';
    size.textContent = p.pdf
      ? tr('client.documents.pdf_page_detail', { n: p.pdf.page, total: p.pdf.opened.pages })
      : sizeText(p.file.size);
    text.append(name, size);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button start__remove';
    remove.dataset['docRemove'] = String(index);
    remove.textContent = tr('client.documents.remove');
    remove.setAttribute('aria-label', tr('client.documents.remove_label', { nombre: p.name }));
    li.append(text, remove);
    return li;
  }

  function placeholder(label = ''): HTMLElement {
    const span = document.createElement('span');
    span.className = 'start__thumb';
    span.setAttribute('aria-hidden', 'true');
    span.textContent = label;
    return span;
  }

  function renderFiles() {
    fileList.hidden = picked.length === 0;
    fileList.replaceChildren(...picked.map(fileItem));
  }

  const count = () => ({ n: picked.length });

  // Opens each PDF and adds its pages while places are left, saying which pages fit.
  async function addPdfs(
    files: readonly File[],
    said: string[],
    started: number,
  ): Promise<ErrorCode | null> {
    let problem: ErrorCode | null = null;
    for (const file of files) {
      const free = LIMITS.maxImages - picked.length;
      let opened: OpenedPdf | PdfProblem;
      try {
        opened = await deps.pdfs.open(file);
      } catch {
        opened = 'pdf_unreadable';
      }
      // Abandoned for the manual path: what arrives late is let go.
      if (started !== generation) {
        if (typeof opened !== 'string') opened.close();
        return null;
      }
      if (typeof opened === 'string') {
        problem ??= opened;
        continue;
      }
      const fit = Math.min(opened.pages, free);
      if (fit === 0) opened.close();
      for (let page = 1; page <= fit; page += 1)
        picked.push({
          file,
          name: tr('client.documents.pdf_page', { nombre: file.name, n: page }),
          thumbnail: null,
          pdf: { opened, page },
        });
      said.push(
        fit < opened.pages
          ? tr('client.documents.pdf_pages_fit', { nombre: file.name, k: fit, total: opened.pages })
          : tr('client.documents.pdf_added', { nombre: file.name, total: opened.pages }),
      );
      if (fit < opened.pages) problem ??= 'too_many_files';
    }
    return problem;
  }

  async function addFiles(files: readonly File[], fromCamera = false) {
    if (busy || files.length === 0) return;
    setError(null);
    hideReview();
    const {
      photos: images,
      pdfs,
      refused,
      problem,
      duplicates,
    } = admit([...new Set(picked.map((p) => p.file))], LIMITS.maxImages - picked.length, files);
    const names = new Map<File, string>();
    for (const file of images) {
      const name = fromCamera ? tr('client.documents.photo', { n: (photos += 1) }) : file.name;
      names.set(file, name);
      const thumbnail =
        typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null;
      picked.push({ file, name, thumbnail });
    }
    const said: string[] = [];
    let pdfProblem: ErrorCode | null = null;
    if (pdfs.length > 0) {
      renderFiles();
      const started = generation;
      setBusy(true, tr('client.documents.status.opening'), true);
      pdfProblem = await addPdfs(pdfs, said, started);
      if (started !== generation) return;
      setBusy(false, '');
    }
    const first = images[0];
    if (images.length === 1 && first)
      said.unshift(
        tr('client.documents.added_one', { nombre: names.get(first) ?? '', ...count() }),
      );
    else if (images.length > 1)
      said.unshift(tr('client.documents.added_many', { k: images.length, ...count() }));
    else if (pdfs.length > 0) said.push(tr('client.documents.count', count()));
    renderFiles();
    for (const file of duplicates)
      said.push(tr('client.documents.already_added', { nombre: file.name }));
    if (refused === 1) said.push(tr('client.documents.left_out_one'));
    else if (refused > 1) said.push(tr('client.documents.left_out_many', { k: refused }));
    fileStatus.textContent = said.join(' ');
    fieldError('files', problem ?? pdfProblem);
  }

  // Closes the PDFs no entry draws from any more.
  function closeUnused(candidates: Iterable<OpenedPdf>) {
    for (const opened of new Set(candidates))
      if (!picked.some((p) => p.pdf?.opened === opened)) opened.close();
  }

  function removeFile(index: number) {
    const [gone] = picked.splice(index, 1);
    if (!gone) return;
    if (gone.thumbnail) URL.revokeObjectURL(gone.thumbnail);
    encodedPages.delete(gone);
    if (gone.pdf) closeUnused([gone.pdf.opened]);
    renderFiles();
    fileStatus.textContent = tr('client.documents.removed', { nombre: gone.name, ...count() });
    fieldError('files', null);
    setError(null);
    hideReview();
    // Focus stays in the list: on the file that took its place, the one before, or the picker.
    const buttons = fileList.querySelectorAll<HTMLElement>('[data-doc-remove]');
    (buttons[Math.min(index, buttons.length - 1)] ?? fileInput).focus();
  }

  function clearFiles() {
    for (const p of picked) if (p.thumbnail) URL.revokeObjectURL(p.thumbnail);
    const opened = picked.flatMap((p) => (p.pdf ? [p.pdf.opened] : []));
    picked = [];
    encodedPages.clear();
    closeUnused(opened);
    renderFiles();
    fileStatus.textContent = '';
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

  function showDone(
    p: Prefill,
    checks: readonly CoherenceCheck[],
    e: Extraction,
    skipped: readonly string[],
  ) {
    const line = recognisedLine(e.documents, tr);
    if (recognised) {
      recognised.hidden = line === '';
      recognised.textContent = line;
    }
    const n = prefilledCount(p);
    summary.textContent =
      n === 0 ? tr('client.documents.done_none') : tr('client.documents.done', { n });
    const lines = [
      ...skipped,
      ...conflictLines(e.conflicts, tr),
      ...(hasLowConfidence(p) ? [tr('client.documents.done_low')] : []),
      ...(hasHolidayDays(p) ? [tr('client.documents.holiday_unit')] : []),
      ...checks.map((c) => tr(`client.documents.check.${c}`)),
    ];
    notes.hidden = lines.length === 0;
    notes.replaceChildren(
      ...lines.map((text) => {
        const li = document.createElement('li');
        li.textContent = text;
        return li;
      }),
    );
    show('done');
  }

  function validate(): readonly Picked[] | null {
    const fileProblem = checkSelection(picked.length);
    fieldError('files', fileProblem);
    fieldError('consent', consent.checked ? null : 'consent_missing');
    if (fileProblem !== null) fileInput.focus();
    else if (!consent.checked) consent.focus();
    return fileProblem === null && consent.checked ? [...picked] : null;
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

  // Encodes the pages in their order, sharing what the request may weigh among them. A PDF's
  // pages are kept once drawn, and the document closed, so a second try needs no reader.
  async function encodeAll(
    pages: readonly Picked[],
    started: number,
  ): Promise<EncodedFile[] | { readonly tooSlow: OpenedPdf } | null> {
    const encoded: EncodedFile[] = [];
    for (const [i, p] of pages.entries()) {
      const share = photoShare(requestBytes(encoded), pages.length - i);
      const kept = encodedPages.get(p);
      const image =
        kept ??
        (await (p.pdf ? p.pdf.opened.render(p.pdf.page, share) : encoder.encode(p.file, share)));
      if (started !== generation) return null;
      if (image === 'pdf_too_slow') return p.pdf ? { tooSlow: p.pdf.opened } : null;
      if (p.pdf) encodedPages.set(p, image);
      encoded.push(image);
    }
    for (const opened of new Set(pages.flatMap((p) => (p.pdf ? [p.pdf.opened] : []))))
      opened.close();
    return encoded;
  }

  // The photos that look like they will read badly, each with the one thing to say about it.
  function qualityWarnings(pages: readonly Picked[], encoded: readonly EncodedFile[]) {
    return pages.flatMap((picked, i) => {
      const quality = encoded[i]?.quality;
      const problem = quality ? qualityProblem(quality) : null;
      return problem ? [{ picked, problem }] : [];
    });
  }

  function warnQuality(warnings: readonly { picked: Picked; problem: QualityProblem }[]) {
    for (const problem of new Set(warnings.map((w) => w.problem))) events.qualityWarned(problem);
    flagged = warnings.map((w) => w.picked);
    showReview(
      '',
      warnings.map((w) => tr(`client.documents.quality.${w.problem}`, { nombre: w.picked.name })),
      tr(
        warnings.length === 1
          ? 'client.documents.quality.ask_one'
          : 'client.documents.quality.ask_many',
      ),
    );
  }

  async function read(pages: readonly Picked[], qualityChecked = false) {
    const started = generation;
    setBusy(true, tr('client.documents.status.preparing'), true);
    const fail = (code: ErrorCode) => {
      events.extractionFailed(code);
      if (code === 'model_unavailable') outage.remember();
      setBusy(false, '');
      setError(code);
    };
    let encoded: EncodedFile[] | { readonly tooSlow: OpenedPdf } | null;
    try {
      encoded = await encodeAll(pages, started);
    } catch {
      if (started !== generation) return;
      return fail('image_unreadable');
    }
    if (encoded === null) return;
    if (!Array.isArray(encoded)) {
      // A PDF that won't draw in time leaves the list, so the next try is not stuck on it too.
      const slow = encoded.tooSlow;
      picked = picked.filter((p) => p.pdf?.opened !== slow);
      slow.close();
      renderFiles();
      return fail('pdf_too_slow');
    }
    if (requestBytes(encoded) > LIMITS.requestBudgetBytes) return fail('payload_too_large');
    const warnings = qualityChecked ? [] : qualityWarnings(pages, encoded);
    if (warnings.length > 0) {
      setBusy(false, '');
      return warnQuality(warnings);
    }

    setBusy(true, tr('client.documents.status.captcha'), true);
    let captchaToken: string;
    try {
      captchaToken = await captcha.token();
    } catch {
      if (started !== generation) return;
      return fail('captcha_unavailable');
    }
    if (started !== generation) return;

    const stored = passes.pass();
    const usePass = stored !== null && passState(stored, deps.now()) === 'valid';
    const pdfsPicked = new Set(pages.filter((p) => p.pdf).map((p) => p.file)).size;
    const files = filesBucket(pages.length);
    events.uploadStarted(files, pdfsPicked);
    setBusy(true, tr('client.documents.status.reading'));
    const result = await api.extract({
      files: encoded.map(({ mediaType, data }) => ({ mediaType, data })),
      captchaToken,
      ...(usePass ? { pass: stored.token } : { quota: passes.quota() }),
    });
    const nameOf = (page: number) => pages[page - 1]?.name ?? '';
    if (!result.ok && result.code === 'nothing_read') {
      // Spent no read: the files stay, so the ones that failed can be changed.
      const skipped = skippedPages(result.pages, pages.length, true);
      events.nothingRead(reasonsOf(skipped), files, pdfsPicked);
      setBusy(false, '');
      return showReview(tr('client.documents.nothing_read'), skippedLines(skipped, nameOf, tr), '');
    }
    if (!result.ok) {
      // The server has the last word on what was sent: a pass it no longer honours is dropped, so
      // the next read is a free one, and so is a quota token it refuses.
      if (usePass && result.code === 'pass_exhausted') passes.updateReads(0);
      if (usePass && result.code === 'pass_invalid') {
        if (await fetchPassAgain(stored)) {
          events.extractionFailed(result.code);
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
    const offer = result.extraction.fields.agreementSeveranceTotal;
    agreementOffer = offer && typeof offer.value === 'number' ? offer.value : null;
    const skipped = skippedPages(result.extraction.pages, pages.length, false);
    events.extractionCompleted({
      kinds: [...new Set(result.extraction.documents.map((d) => d.kind))],
      fields: prefilledCount(prefill),
      lowConfidence: hasLowConfidence(prefill),
      failedChecks: result.failedChecks.length > 0,
      conflicts: result.extraction.conflicts.length > 0,
      escalated: result.escalated,
      skippedReasons: reasonsOf(skipped),
    });
    setBusy(false, '');
    upload.reset();
    clearFiles();
    fieldError('files', null);
    showDone(
      prefill,
      result.failedChecks,
      result.extraction,
      skippedLines(skipped, nameOf, tr, 'client.documents.skipped.done'),
    );
  }

  upload.addEventListener('submit', (e) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    hideReview();
    const valid = validate();
    if (valid) void read(valid);
  });
  review.querySelector('[data-doc-send-anyway]')?.addEventListener('click', () => {
    if (busy) return;
    events.qualityOverridden();
    hideReview();
    const valid = validate();
    if (valid) void read(valid, true);
  });
  // Takes the flagged photos out of the list, so new ones can take their place.
  review.querySelector('[data-doc-retake]')?.addEventListener('click', () => {
    if (busy) return;
    const gone = flagged.filter((p) => picked.includes(p));
    for (const p of gone) if (p.thumbnail) URL.revokeObjectURL(p.thumbnail);
    picked = picked.filter((p) => !gone.includes(p));
    hideReview();
    renderFiles();
    fileStatus.textContent = tr('client.documents.removed', {
      nombre: gone.map((p) => p.name).join(', '),
      ...count(),
    });
    fileInput.focus();
  });
  for (const input of [fileInput, cameraInput])
    input?.addEventListener('change', () => {
      void addFiles([...(input.files ?? [])], input === cameraInput);
      // Cleared, so choosing the same file again still counts as a change.
      input.value = '';
    });
  fileList.addEventListener('click', (e) => {
    const button = e.target instanceof Element ? e.target.closest('[data-doc-remove]') : null;
    if (!(button instanceof HTMLElement) || busy) return;
    removeFile(Number(button.dataset['docRemove']));
  });
  const drop = required(upload.querySelector<HTMLElement>('[data-doc-drop]'), 'drop zone');
  const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
  // A file dropped beside the zone would make the browser open it and leave the page.
  for (const type of ['dragover', 'drop'] as const)
    upload.addEventListener(type, (e) => {
      if (carriesFiles(e)) e.preventDefault();
    });
  drop.addEventListener('dragover', (e) => {
    if (!carriesFiles(e) || busy) return;
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    drop.dataset['over'] = '';
  });
  drop.addEventListener('dragleave', (e) => {
    if (!(e.relatedTarget instanceof Node && drop.contains(e.relatedTarget)))
      delete drop.dataset['over'];
  });
  drop.addEventListener('drop', (e) => {
    delete drop.dataset['over'];
    const dropped = e.dataTransfer?.files;
    if (busy || !dropped || dropped.length === 0) return;
    void addFiles([...dropped]);
  });
  consent.addEventListener('change', () => fieldError('consent', null));

  for (const button of start.querySelectorAll('[data-start-upload]'))
    button.addEventListener('click', () => {
      if (!panels.choose.hidden) events.startChosen('upload');
      show('upload');
    });
  for (const button of start.querySelectorAll('[data-start-manual]'))
    button.addEventListener('click', () => {
      if (busy && !preparing) return;
      if (preparing) {
        generation += 1;
        setBusy(false, '');
      }
      events.startChosen('manual');
      showCalculator(true);
    });
  start.querySelector('[data-start-back]')?.addEventListener('click', () => {
    if (busy) return;
    applyOutage();
    show('choose');
  });
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
    agreementOffer = null;
  });

  const startStatus = panels.choose.querySelector<HTMLElement>('[data-start-status]');

  return {
    showCalculator,
    // Beside the severance of a result: what the uploaded agreement offers, as a figure only.
    showAgreementOffer(result: ParentNode) {
      const sheet = result.querySelector('[data-item="severance"]');
      sheet?.querySelector('[data-agreement-offer]')?.remove();
      if (!sheet || agreementOffer === null) return;
      const note = document.createElement('p');
      note.className = 'item__note';
      note.dataset['agreementOffer'] = '';
      note.textContent = tr('client.documents.agreement_offer', {
        importe: formatEuros(agreementOffer),
      });
      const reference = sheet.querySelector('[data-reference]');
      if (reference) reference.after(note);
      else sheet.append(note);
    },
    // A message on the start sheet, such as the outcome of a payment with no review to show.
    notice(text: string) {
      if (startStatus) startStatus.textContent = text;
    },
    // Opens on the choice between uploading and typing.
    showStart(focus = false) {
      start.hidden = false;
      form.hidden = true;
      if (deps.tabs) deps.tabs.hidden = true;
      applyOutage();
      show('choose', focus);
    },
  };
}
