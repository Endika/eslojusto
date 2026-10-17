import { required } from '../calculator/dom';
import { formatInteger } from '../calculator/number';
import type { Translate } from '../i18n/client';
import {
  LIMITS,
  LOCATE_LIMITS,
  type Api,
  isCoherenceCheck,
  type FailedCheck,
  type Confidence,
  type ErrorCode,
  type RecognisedDocument,
} from './contract';
import { heldEntries, mergeRead, type Applied, type ListSpecs } from './merge';
import { admit, checkSelection, filesBucket } from './files';
import type { OutageMemory } from './outage';
import type { PassStore } from './pass';
import type { QualityProblem } from './quality';
import {
  canLocate,
  encodeAll,
  locatePages,
  qualityWarnings,
  sendRead,
  type ReadingDeps,
} from './reading';
import { missingPageLines, reasonsOf, skippedLines, skippedPages } from './skipped';
import type {
  Captcha,
  DocumentEvents,
  DocumentReading,
  EncodedFile,
  FileEncoder,
  OpenedPdf,
  PdfPages,
  PdfProblem,
  ReadMark,
  ReadPrefill,
  ReviewForm,
} from './ports';
import { recognisedLine } from './summary';

interface UploadDeps<F extends string, L extends string> {
  readonly api: Api<F, L>;
  // How the section's form takes what was read.
  readonly reading: DocumentReading<F, L>;
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
  readonly calculator: Pick<ReviewForm, 'form' | 'fill' | 'open' | 'entries'>;
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
  for (const input of container.querySelectorAll('input, select, textarea')) {
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean);
    if (!ids.includes(mark.id)) input.setAttribute('aria-describedby', [...ids, mark.id].join(' '));
  }
}

function removeMark(mark: Element) {
  const container = mark.parentElement;
  for (const input of container?.querySelectorAll('input, select, textarea') ?? []) {
    const ids = (input.getAttribute('aria-describedby') ?? '').split(' ');
    input.setAttribute('aria-describedby', ids.filter((i) => i !== mark.id).join(' '));
  }
  mark.remove();
}

// What the reads leave on the form: their values, marked as read, on top of what earlier reads or
// the person put there. Returns how to apply a read.
function readMarks<F extends string, L extends string>(
  calculator: UploadDeps<F, L>['calculator'],
  lists: ListSpecs,
  tr: Translate,
) {
  const { form } = calculator;
  // What the reads since the form last started over put in it, by name.
  const applied = new Map<string, Applied>();

  function markForm(marks: readonly ReadMark[]) {
    const label = (m: ReadMark) =>
      m.conflict
        ? tr('client.documents.mark_conflict')
        : tr(m.derived ? 'client.documents.mark_derived' : 'client.documents.mark', {
            nivel: tr(`client.documents.confidence.${m.confidence}`),
          }) + (m.confidence === 'low' ? tr('client.documents.mark_low') : '');
    for (const m of marks) {
      const container = form.querySelector<HTMLElement>(m.container);
      if (container) addMark(container, m.id, label(m), m.confidence);
    }
  }

  // Whether a control still holds what the page gave it, so the answer is nobody's yet.
  function atDefault(name: string, value: string): boolean {
    const controls = [
      ...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        'input[name], select[name], textarea[name]',
      ),
    ].filter((el) => el.name === name);
    return controls.every((el) => {
      if (el instanceof HTMLSelectElement) {
        const options = [...el.options];
        return (options.find((o) => o.defaultSelected) ?? options[0])?.value === value;
      }
      if (el instanceof HTMLInputElement && (el.type === 'radio' || el.type === 'checkbox'))
        return el.checked === el.defaultChecked;
      return el.value === el.defaultValue;
    });
  }

  // A mark tells where a value came from; once the person changes the value, it no longer applies.
  // It sits in the element that holds the answer, the nearest one around the input that has one.
  const unmark = (e: Event) => {
    const input =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLSelectElement ||
      e.target instanceof HTMLTextAreaElement
        ? e.target
        : null;
    let container = input?.parentElement ?? null;
    while (container && container !== form && !container.querySelector(':scope > [data-read-mark]'))
      container = container.parentElement;
    if (!container || container === form) return;
    for (const mark of container.querySelectorAll(':scope > [data-read-mark]')) removeMark(mark);
  };
  form.addEventListener('input', unmark);
  form.addEventListener('change', unmark);
  form.addEventListener('reset', () => {
    for (const mark of form.querySelectorAll('[data-read-mark]')) removeMark(mark);
    applied.clear();
  });

  // The notes say what the read could not set as it came.
  return function apply(prefill: ReadPrefill): string[] {
    const held = heldEntries(calculator.entries(), applied, atDefault, lists);
    const merged = mergeRead(prefill, held, applied, lists);
    calculator.fill(merged.entries);
    markForm(merged.marks);
    for (const [name, value] of merged.applied) applied.set(name, value);
    return [
      ...(merged.differ ? [tr('client.documents.reads_differ')] : []),
      ...(merged.typedDiffers ? [tr('client.documents.typed_differs')] : []),
      ...(merged.recalculated ? [tr('client.documents.recalculated')] : []),
      ...(merged.full ? [tr('client.documents.rows_full')] : []),
    ];
  };
}

// The pages chosen so far, in the order they were added: each pick, drop or photo adds to them,
// and a PDF adds one entry per page.
interface Picked {
  readonly file: File;
  readonly name: string;
  readonly thumbnail: string | null;
  readonly pdf?: { readonly opened: OpenedPdf; readonly page: number };
  // A whole PDF longer than the places left: its useful pages are located before the read.
  readonly long?: { readonly opened: OpenedPdf };
}
const openedOf = (p: Picked): OpenedPdf | undefined => p.pdf?.opened ?? p.long?.opened;

const pdfPage = (file: File, opened: OpenedPdf, page: number, tr: Translate): Picked => ({
  file,
  name: tr('client.documents.pdf_page', { nombre: file.name, n: page }),
  thumbnail: null,
  pdf: { opened, page },
});

function fileItem(p: Picked, index: number, tr: Translate): HTMLLIElement {
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
  } else li.append(placeholder(openedOf(p) ? 'PDF' : ''));
  const text = document.createElement('span');
  const name = document.createElement('span');
  name.className = 'start__file-name';
  name.textContent = p.name;
  const size = document.createElement('span');
  size.className = 'start__file-size';
  size.textContent = p.pdf
    ? tr('client.documents.pdf_page_detail', { n: p.pdf.page, total: p.pdf.opened.pages })
    : p.long
      ? tr('client.documents.pdf_long_detail', { total: p.long.opened.pages })
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

const listItems = (lines: readonly string[]) =>
  lines.map((text) => {
    const li = document.createElement('li');
    li.textContent = text;
    return li;
  });

interface DonePanel {
  readonly recognised: HTMLElement | null;
  readonly summary: HTMLElement;
  readonly notes: HTMLElement;
}

// Says what a read recognised, how many answers it gave, and what else there is to know of it.
function fillDone(
  { recognised, summary, notes }: DonePanel,
  tr: Translate,
  read: {
    readonly prefill: ReadPrefill;
    readonly checks: readonly FailedCheck[];
    readonly documents: readonly RecognisedDocument[];
    readonly skipped: readonly string[];
    readonly wordsEveryCheck: boolean;
  },
) {
  const line = recognisedLine(read.documents, tr);
  if (recognised) {
    recognised.hidden = line === '';
    recognised.textContent = line;
  }
  const n = read.prefill.count;
  summary.textContent =
    n === 0
      ? tr('client.documents.done_none')
      : n === 1
        ? tr('client.documents.done_one')
        : tr('client.documents.done', { n });
  const lines = [
    ...read.skipped,
    ...missingPageLines(read.checks, tr),
    ...read.prefill.notes,
    ...(read.wordsEveryCheck ? [] : read.checks.filter(isCoherenceCheck)).map((c) =>
      tr(`client.documents.check.${c}`),
    ),
  ];
  notes.hidden = lines.length === 0;
  notes.replaceChildren(...listItems(lines));
}

// Says what is wrong with the files or the consent, or that nothing is any more.
function showFieldError(
  upload: HTMLElement,
  tr: Translate,
  field: 'files' | 'consent',
  code: ErrorCode | LocalError | null,
) {
  const slip = upload.querySelector<HTMLElement>(`[data-doc-error-for="${field}"]`);
  if (!slip) return;
  slip.hidden = code === null;
  slip.textContent = code === null ? '' : tr(`client.documents.error.${code}`);
  const inputs = upload.querySelectorAll(`[data-doc-field="${field}"] input`);
  for (const input of inputs)
    if (code === null) input.removeAttribute('aria-invalid');
    else input.setAttribute('aria-invalid', 'true');
}

// Files dropped on the zone are added, unless `busy`.
function acceptDrops(
  upload: HTMLElement,
  busy: () => boolean,
  add: (files: File[]) => Promise<void>,
) {
  const drop = required(upload.querySelector<HTMLElement>('[data-doc-drop]'), 'drop zone');
  const carriesFiles = (e: DragEvent) => e.dataTransfer?.types.includes('Files') ?? false;
  // A file dropped beside the zone would make the browser open it and leave the page.
  for (const type of ['dragover', 'drop'] as const)
    upload.addEventListener(type, (e) => {
      if (carriesFiles(e)) e.preventDefault();
    });
  drop.addEventListener('dragover', (e) => {
    if (!carriesFiles(e) || busy()) return;
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
    if (busy() || !dropped || dropped.length === 0) return;
    void add([...dropped]);
  });
}

export function setUpUpload<F extends string, L extends string>(
  start: HTMLElement,
  deps: UploadDeps<F, L>,
) {
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
  const done: DonePanel = {
    recognised: panels.done.querySelector<HTMLElement>('[data-done-documents]'),
    summary: required(panels.done.querySelector<HTMLElement>('[data-done-summary]'), 'sum'),
    notes: required(panels.done.querySelector<HTMLElement>('[data-done-notes]'), 'notes'),
  };
  const uploadChoice = panels.choose.querySelector<HTMLElement>('[data-start-upload]');
  const unavailableNote = panels.choose.querySelector<HTMLElement>('[data-start-unavailable]');
  let busy = false;
  // While files are opened, drawn and encoded, nothing has left the page yet: «Rellenar a mano»
  // stays usable and abandons the work, whose late results are then dropped.
  let preparing = false;
  let generation = 0;
  const apply = readMarks(calculator, deps.reading.lists ?? {}, tr);

  let picked: Picked[] = [];
  const encodedPages = new Map<Picked, EncodedFile>();
  let photos = 0;
  // The photos the last quality warning was about, for «Repetir».
  let flagged: Picked[] = [];

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

  const fieldError = (field: 'files' | 'consent', code: ErrorCode | LocalError | null) =>
    showFieldError(upload, tr, field, code);

  function setError(code: ErrorCode | null) {
    errorSlip.hidden = code === null;
    errorSlip.textContent = code === null ? '' : tr(`client.documents.error.${code}`);
  }

  // A message about the files themselves: why a read found nothing, or which photos look like
  // they will read badly, with the choice to take them again or send them as they are.
  function showReview(lead: string, lines: readonly string[], ask: string) {
    reviewLead.textContent = lead;
    reviewAsk.textContent = ask;
    reviewList.replaceChildren(...listItems(lines));
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

  function renderFiles() {
    fileList.hidden = picked.length === 0;
    fileList.replaceChildren(...picked.map((p, i) => fileItem(p, i, tr)));
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
      if (canLocate(api, opened.pages, free, picked)) {
        picked.push({ file, name: file.name, thumbnail: null, long: { opened } });
        said.push(tr('client.documents.pdf_long', { nombre: file.name, total: opened.pages }));
        continue;
      }
      const fit = Math.min(opened.pages, free);
      if (fit === 0) opened.close();
      for (let page = 1; page <= fit; page += 1) picked.push(pdfPage(file, opened, page, tr));
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
    } = admit(
      [...new Set(picked.map((p) => p.file))],
      LIMITS.maxImages - picked.length,
      files,
      api.locate ? LOCATE_LIMITS.maxPdfBytes : LIMITS.maxPdfBytes,
    );
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
      if (!picked.some((p) => openedOf(p) === opened)) opened.close();
  }

  function removeFile(index: number) {
    const [gone] = picked.splice(index, 1);
    if (!gone) return;
    if (gone.thumbnail) URL.revokeObjectURL(gone.thumbnail);
    encodedPages.delete(gone);
    const goneOpened = openedOf(gone);
    if (goneOpened) closeUnused([goneOpened]);
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
    const opened = picked.flatMap((p) => openedOf(p) ?? []);
    picked = [];
    encodedPages.clear();
    closeUnused(opened);
    renderFiles();
    fileStatus.textContent = '';
  }

  function validate(): readonly Picked[] | null {
    const fileProblem = checkSelection(picked.length);
    fieldError('files', fileProblem);
    fieldError('consent', consent.checked ? null : 'consent_missing');
    if (fileProblem !== null) fileInput.focus();
    else if (!consent.checked) consent.focus();
    return fileProblem === null && consent.checked ? [...picked] : null;
  }

  // The flow of one read, let go once the person leaves for the form.
  const flowOf = (started: number): ReadingDeps<F, L> => ({
    api,
    captcha,
    encoder,
    passes,
    now: deps.now,
    current: () => started === generation,
    progress: (kind, k, total) => {
      status.textContent = tr(`client.documents.status.${kind}_n`, { k, total });
    },
  });

  function warnQuality(warnings: readonly { page: Picked; problem: QualityProblem }[]) {
    for (const problem of new Set(warnings.map((w) => w.problem))) events.qualityWarned(problem);
    flagged = warnings.map((w) => w.page);
    showReview(
      '',
      warnings.map((w) => tr(`client.documents.quality.${w.problem}`, { nombre: w.page.name })),
      tr(
        warnings.length === 1
          ? 'client.documents.quality.ask_one'
          : 'client.documents.quality.ask_many',
      ),
    );
  }

  function failRead(code: ErrorCode) {
    events.extractionFailed(code);
    if (code === 'model_unavailable') outage.remember();
    setBusy(false, '');
    setError(code);
  }

  function refused({ code, renewed }: { code: ErrorCode; renewed: boolean }) {
    if (!renewed) return failRead(code);
    events.extractionFailed(code);
    setBusy(false, tr('client.documents.pass.renewed'));
  }

  // Swaps the long PDF for the pages the locate step chose or, if it could not choose, for its
  // first pages as before, and says which. One that fits by now goes whole. `stopped` when the
  // read is refused or the person left for the form meanwhile.
  async function locateLong(
    pages: readonly Picked[],
    flow: ReadingDeps<F, L>,
  ): Promise<readonly Picked[] | 'stopped'> {
    const long = pages.find((p) => p.long);
    if (!long?.long || !api.locate) return pages;
    const { opened } = long.long;
    const room = LIMITS.maxImages - (pages.length - 1);
    const swapFor = (numbers: readonly number[]) => {
      const entries = numbers.map((n) => pdfPage(long.file, opened, n, tr));
      const swap = (list: readonly Picked[]) => list.flatMap((p) => (p === long ? entries : [p]));
      picked = swap(picked);
      renderFiles();
      return swap(pages);
    };
    if (opened.pages <= room) return swapFor(Array.from({ length: opened.pages }, (_, i) => i + 1));

    const locating = tr('client.documents.status.locating', { nombre: long.file.name });
    setBusy(true, locating, true);
    const located = await locatePages(opened, room, flow, () => setBusy(true, locating));
    if (located.kind === 'captcha_unavailable') failRead(located.kind);
    if (located.kind === 'refused') refused(located);
    if (located.kind !== 'chosen' && located.kind !== 'first') return 'stopped';
    const swapped = swapFor(located.pages);
    fileStatus.textContent =
      located.kind === 'first'
        ? tr('client.documents.locate_failed', { nombre: long.file.name, k: room })
        : tr('client.documents.located', {
            nombre: long.file.name,
            paginas: located.pages.join(', '),
          });
    return swapped;
  }

  async function read(all: readonly Picked[], qualityChecked = false) {
    const flow = flowOf(generation);
    const pages = await locateLong(all, flow);
    if (pages === 'stopped') return;
    setBusy(true, tr('client.documents.status.preparing'), true);
    const encoded = await encodeAll(pages, encodedPages, flow);
    if (encoded.kind === 'stopped') return;
    if (encoded.kind === 'failed') return failRead(encoded.code);
    if (encoded.kind === 'too_slow') {
      // A PDF that won't draw in time leaves the list, so the next try is not stuck on it too.
      picked = picked.filter((p) => p.pdf?.opened !== encoded.pdf);
      encoded.pdf.close();
      renderFiles();
      return failRead('pdf_too_slow');
    }
    const warnings = qualityChecked ? [] : qualityWarnings(pages, encoded.files);
    if (warnings.length > 0) {
      setBusy(false, '');
      return warnQuality(warnings);
    }

    setBusy(true, tr('client.documents.status.captcha'), true);
    const pdfsPicked = new Set(pages.filter((p) => p.pdf).map((p) => p.file)).size;
    const files = filesBucket(pages.length);
    const outcome = await sendRead(encoded.files, flow, () => {
      events.uploadStarted(files, pdfsPicked);
      setBusy(true, tr('client.documents.status.reading'));
    });
    if (outcome.kind === 'stopped') return;
    if (outcome.kind === 'captcha_unavailable') return failRead(outcome.kind);
    if (outcome.kind === 'refused') return refused(outcome);
    const nameOf = (page: number) => pages[page - 1]?.name ?? '';
    if (outcome.kind === 'nothing_read') {
      // Spent no read: the files stay, so the ones that failed can be changed.
      const skipped = skippedPages(outcome.pages, pages.length, true);
      events.nothingRead(reasonsOf(skipped), files, pdfsPicked);
      setBusy(false, '');
      return showReview(tr('client.documents.nothing_read'), skippedLines(skipped, nameOf, tr), '');
    }
    const { result } = outcome;

    const prefill = deps.reading.prefill(
      result.extraction,
      Object.fromEntries(calculator.entries()),
      result.failedChecks,
    );
    const merged = apply(prefill);
    const skipped = skippedPages(result.extraction.pages, pages.length, false);
    events.extractionCompleted({
      kinds: [...new Set(result.extraction.documents.map((d) => d.kind))],
      fields: prefill.count,
      lowConfidence: prefill.lowConfidence,
      failedChecks: result.failedChecks.length > 0,
      conflicts: result.extraction.conflicts.length > 0,
      escalated: result.escalated,
      skippedReasons: reasonsOf(skipped),
    });
    setBusy(false, '');
    upload.reset();
    clearFiles();
    fieldError('files', null);
    fillDone(done, tr, {
      prefill: { ...prefill, notes: [...prefill.notes, ...merged] },
      checks: result.failedChecks,
      documents: result.extraction.documents,
      skipped: skippedLines(skipped, nameOf, tr, 'client.documents.skipped.done'),
      wordsEveryCheck: deps.reading.wordsEveryCheck === true,
    });
    show('done');
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
  acceptDrops(upload, () => busy, addFiles);
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
  for (const button of panels.choose.querySelectorAll<HTMLButtonElement>(
    '[data-start-upload], [data-start-manual]',
  ))
    button.disabled = false;

  const startStatus = panels.choose.querySelector<HTMLElement>('[data-start-status]');

  return {
    showCalculator,
    // Fills the form with what a read gave, marked as read, as a read just made does.
    fillRead(prefill: ReadPrefill) {
      apply(prefill);
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
