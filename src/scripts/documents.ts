import type { FormEntries } from '../calculator/fill';
import { stepOfHash, type Detail } from '../calculator/flow';
import { createApi } from '../documents/api';
import { TURNSTILE_SCRIPT, type DocumentsConfig } from '../documents/config';
import type { Api, ExtractionShape, PassApi } from '../documents/contract';
import { fitWithin } from '../documents/files';
import { canvasJpeg, whiteCanvas } from './jpeg';
import { photoQuality } from './quality';
import { createOutageMemory } from '../documents/outage';
import { createPassStore } from '../documents/pass';
import { setUpPayment } from '../documents/payment';
import type {
  Browser,
  Captcha,
  CaptchaAction,
  DocumentEvents,
  DocumentReading,
  FileEncoder,
  KeyValueStore,
  OfferedReview,
  PdfPages,
  ReadPrefill,
  ReviewForm,
} from '../documents/ports';
import { setUpUpload } from '../documents/upload';
import type { Translate } from '../i18n/client';
import { localToday } from './clock';

const CAPTCHA_TIMEOUT_MS = 90_000;

// localStorage or sessionStorage behind try/catch: blocked storage reads as empty.
function storage(get: () => Storage): KeyValueStore {
  return {
    get(key) {
      try {
        return get().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        get().setItem(key, value);
      } catch {
        // Without storage the pass lasts as long as the page.
      }
    },
    remove(key) {
      try {
        get().removeItem(key);
      } catch {
        // Nothing to remove.
      }
    },
  };
}

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(widget: string): void;
}

// Turnstile loads only when a document is about to be read or the pass paid for, once for the
// page, and each of those gets a fresh token.
function turnstileLoader(): () => Promise<Turnstile> {
  let turnstileApi: Promise<Turnstile> | null = null;
  return () =>
    (turnstileApi ??= new Promise<Turnstile>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.onload = () => {
        const t = (window as unknown as { turnstile?: Turnstile }).turnstile;
        if (t) resolve(t);
        else reject(new Error('Turnstile missing'));
      };
      script.onerror = () => {
        turnstileApi = null;
        reject(new Error('Turnstile unavailable'));
      };
      document.head.append(script);
    }));
}

// The challenge in the page's language where Turnstile has it; the co-official languages read
// Spanish, and any other the browser's own.
const TURNSTILE_LANGUAGE: Readonly<Record<string, string>> = {
  es: 'es',
  ca: 'es',
  eu: 'es',
  gl: 'es',
  en: 'en',
  fr: 'fr',
  ro: 'ro',
  ar: 'ar',
  uk: 'uk',
  zh: 'zh-cn',
};
const turnstileLanguage = (lang: string): string => TURNSTILE_LANGUAGE[lang] ?? 'auto';

function turnstileCaptcha(
  loadTurnstile: () => Promise<Turnstile>,
  siteKey: string,
  container: HTMLElement,
  action: CaptchaAction,
): Captcha {
  let widget: string | null = null;
  return {
    async token() {
      const turnstile = await loadTurnstile();
      if (widget !== null) turnstile.remove(widget);
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Turnstile timeout')), CAPTCHA_TIMEOUT_MS);
        const done = (fn: () => void) => () => {
          clearTimeout(timer);
          fn();
        };
        widget = turnstile.render(container, {
          sitekey: siteKey,
          action,
          appearance: 'interaction-only',
          language: turnstileLanguage(document.documentElement.lang),
          callback: (token: string) => done(() => resolve(token))(),
          'error-callback': done(() => reject(new Error('Turnstile error'))),
          'expired-callback': done(() => reject(new Error('Turnstile expired'))),
          'timeout-callback': done(() => reject(new Error('Turnstile timeout'))),
        });
      });
    },
  };
}

// Photos are drawn on a canvas at most 1568 px on their long side and leave as JPEG, with what
// the page measured of them to warn before sending.
const canvasEncoder: FileEncoder = {
  async encode(file, maxBytes) {
    const bitmap = await createImageBitmap(file);
    const longSide = Math.max(bitmap.width, bitmap.height);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const { canvas, context } = whiteCanvas(width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const quality = photoQuality(canvas, longSide);
    return { ...(await canvasJpeg(canvas, maxBytes)), ...(quality && { quality }) };
  },
};

// pdf.js and its worker load only when a PDF is picked, from this site.
const pdfPages: PdfPages = {
  open: (file) => import('./pdf-pages').then((m) => m.pdfPages.open(file)),
};

function holdLeave(e: BeforeUnloadEvent) {
  e.preventDefault();
  // Older browsers show the dialog only when returnValue is set.
  e.returnValue = '';
}

const browser: Browser = {
  now: () => Date.now(),
  redirect: (url) => location.assign(url),
  save(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  randomBytes: (count) => crypto.getRandomValues(new Uint8Array(count)),
  warnBeforeLeaving(on) {
    if (on) window.addEventListener('beforeunload', holdLeave);
    else window.removeEventListener('beforeunload', holdLeave);
  },
};

// What a section's page tells the documents of its review, and what it lets them decide.
export interface ReviewHooks<R> {
  onReview(listener: (r: R) => void): void;
  onRestart(listener: () => void): void;
  // Tells the form how a review's result will be shown.
  detail(state: () => Detail): void;
}

// What a section brings to the pass; the rest is the same for all.
interface PassSection<R> {
  // Where the review's answers wait while the person is on Stripe's page; read back and deleted
  // on return.
  readonly keptReviewKey: string;
  paidReview(r: R): OfferedReview;
  // Adds to a result just shown what only the documents read can say.
  decorateResult(result: ParentNode): void;
  // Answers kept by an earlier version of the page, as the form takes them now.
  restore(saved: FormEntries): FormEntries;
  // A section whose pass covers several reviews kept in the page, such as a year of bills, takes
  // them all on the trip to Stripe instead of the form on screen alone.
  readonly basket?: KeptBasket;
}

// The reviews of a basket as the trip to Stripe keeps them: only the answers each was worked out
// from, so the reviews are made again on return.
interface KeptBasket {
  // The answers of every review kept, in order, the one on screen last.
  answers(): readonly FormEntries[];
  // Starts another review on an empty form, beside those already kept.
  startNext(): void;
}

// What a section brings to reading documents, whether or not its page sells the pass.
interface ReadingSection<F extends string, L extends string> {
  readonly extraction: ExtractionShape<F, L>;
  readonly reading: DocumentReading<F, L>;
  // The fragments that open the form itself rather than the start sheet.
  readonly steps: readonly string[];
}

// What a section brings to reading documents and to the pass.
interface DocumentsSection<R, F extends string, L extends string>
  extends PassSection<R>, ReadingSection<F, L> {}

// For a page whose reads send no event, while the pass it shares with every page still does.
export const READS_UNMEASURED: Pick<
  DocumentEvents,
  | 'startChosen'
  | 'uploadStarted'
  | 'extractionCompleted'
  | 'extractionFailed'
  | 'nothingRead'
  | 'qualityWarned'
  | 'qualityOverridden'
> = {
  startChosen() {},
  uploadStarted() {},
  extractionCompleted() {},
  extractionFailed() {},
  nothingRead() {},
  qualityWarned() {},
  qualityOverridden() {},
};

interface DocumentsWiring<R, F extends string, L extends string> {
  readonly form: ReviewForm;
  readonly hooks: ReviewHooks<R>;
  // The address the visit arrived at, before the form rewrote its fragment.
  readonly arrival: { readonly hash: string; readonly search: string };
  readonly section: DocumentsSection<R, F, L>;
  readonly config: DocumentsConfig | null;
  // The section's copy: its root may word some messages its own way.
  readonly tr: Translate;
  // The same copy in Spanish, for the report and the letters.
  readonly paperTr: Translate;
  readonly events: DocumentEvents;
}

const isEntries = (v: unknown): v is FormEntries =>
  Array.isArray(v) &&
  v.every(
    (e) => Array.isArray(e) && e.length === 2 && e.every((x: unknown) => typeof x === 'string'),
  );

// What the pass needs on any page: the API, the pass this browser holds and the page's session.
interface PassContext<R> {
  readonly calculator: ReviewForm;
  readonly hooks: ReviewHooks<R>;
  readonly section: PassSection<R>;
  readonly config: DocumentsConfig;
  readonly api: PassApi;
  readonly loadTurnstile: () => Promise<Turnstile>;
  readonly passes: ReturnType<typeof createPassStore>;
  readonly session: KeyValueStore;
  readonly tr: Translate;
  readonly paperTr: Translate;
  readonly events: DocumentEvents;
}

// The pass offer in the result: it follows each review shown and each start over.
function setUpPass<R>(
  offer: HTMLElement,
  checkoutCaptchaBox: HTMLElement,
  {
    calculator,
    hooks,
    section,
    config,
    api,
    loadTurnstile,
    passes,
    session,
    tr,
    paperTr,
    events,
  }: PassContext<R>,
) {
  const payment = setUpPayment(offer, {
    notice: document.querySelector<HTMLElement>('[data-pass-notice]'),
    api,
    captcha: turnstileCaptcha(
      loadTurnstile,
      config.turnstileSiteKey,
      checkoutCaptchaBox,
      'checkout',
    ),
    passes,
    events,
    browser,
    tr,
    paperTr,
    pdf: () => import('../documents/pdf').then((m) => m.pdfMaker),
    keepReview: () =>
      session.set(
        section.keptReviewKey,
        JSON.stringify(
          section.basket ? { reviews: section.basket.answers() } : calculator.entries(),
        ),
      ),
    today: localToday,
    // A pass verified or dropped shows the review again, with or without its detail.
    passChanged: () => {
      calculator.refreshResult();
      section.decorateResult(document);
    },
  });
  hooks.detail(() => (payment.verified() ? 'unlocked' : 'locked'));
  hooks.onReview((r) => {
    payment.show(section.paidReview(r));
    section.decorateResult(document);
  });
  hooks.onRestart(() => payment.hide());
  return payment;
}

const isBasket = (v: unknown): v is { reviews: FormEntries[] } =>
  typeof v === 'object' &&
  v !== null &&
  'reviews' in v &&
  Array.isArray(v.reviews) &&
  v.reviews.length > 0 &&
  v.reviews.every(isEntries);

// The answers kept for the trip to Stripe come back on any return, paid or not (cancelling or
// the browser's back button arrive without a session id), and are deleted at once: those of the
// form on screen, or of every review of a basket.
function keptReviews<R>(
  session: KeyValueStore,
  section: PassSection<R>,
): readonly FormEntries[] | null {
  let saved: unknown = null;
  try {
    saved = JSON.parse(session.get(section.keptReviewKey) ?? 'null');
  } catch {
    // A damaged entry is dropped below like any other.
  }
  session.remove(section.keptReviewKey);
  if (section.basket && isBasket(saved)) return saved.reviews.map((r) => section.restore(r));
  return isEntries(saved) ? [section.restore(saved)] : null;
}

// The payment's session id on the way back from Stripe, taken off the address at once.
function returnedSession(arrival: { readonly search: string }): string | null {
  const sessionId = new URLSearchParams(arrival.search).get('session_id');
  if (sessionId !== null) history.replaceState(null, '', `${location.pathname}${location.hash}`);
  return sessionId;
}

// What reading documents needs on any page: the API, the pass that pays for the reads and the
// page's session.
interface ReadingContext<F extends string, L extends string> {
  readonly calculator: ReviewForm;
  readonly section: ReadingSection<F, L>;
  readonly config: DocumentsConfig;
  readonly api: Api<F, L>;
  readonly loadTurnstile: () => Promise<Turnstile>;
  readonly passes: ReturnType<typeof createPassStore>;
  readonly session: KeyValueStore;
  readonly tr: Translate;
  readonly events: DocumentEvents;
}

// The start sheet's upload, on the page's form. A pass bought on another page still pays for its
// reads here.
function setUpReading<F extends string, L extends string>(
  start: HTMLElement,
  captchaBox: HTMLElement,
  {
    calculator,
    section,
    config,
    api,
    loadTurnstile,
    passes,
    session,
    tr,
    events,
  }: ReadingContext<F, L>,
) {
  return setUpUpload(start, {
    api,
    reading: section.reading,
    captcha: turnstileCaptcha(loadTurnstile, config.turnstileSiteKey, captchaBox, 'extract'),
    encoder: canvasEncoder,
    pdfs: pdfPages,
    passes,
    events,
    outage: createOutageMemory(session, browser.now),
    now: browser.now,
    tr,
    calculator,
    tabs: document.querySelector<HTMLElement>('.tabs'),
  });
}

const passStore = () =>
  createPassStore(
    storage(() => localStorage),
    browser.now,
  );

// What a section's page can ask of the documents once they are wired.
interface DocumentsHandle {
  // Fills the form with what a read gave, marked as read, as a read just made does.
  fillRead(prefill: ReadPrefill): void;
  // Opens the start sheet again, to read more documents or type.
  showStart(): void;
}

export function wireDocuments<R, F extends string, L extends string>({
  form: calculator,
  hooks,
  arrival,
  section,
  config,
  tr,
  paperTr,
  events,
}: DocumentsWiring<R, F, L>): DocumentsHandle | null {
  const start = document.querySelector<HTMLElement>('[data-documents-start]');
  const offer = document.querySelector<HTMLElement>('[data-pass-offer]');
  const captchaBox = start?.querySelector<HTMLElement>('[data-captcha]');
  const checkoutCaptchaBox = offer?.querySelector<HTMLElement>('[data-pass-captcha]');
  if (!config || !start || !offer || !captchaBox || !checkoutCaptchaBox) return null;

  const api = createApi(
    config.endpoints,
    (url, init) => fetch(url, init),
    section.extraction,
    document.documentElement.lang,
  );
  const loadTurnstile = turnstileLoader();
  const passes = passStore();
  const session = storage(() => sessionStorage);

  const upload = setUpReading(start, captchaBox, {
    calculator,
    section,
    config,
    api,
    loadTurnstile,
    passes,
    session,
    tr,
    events,
  });
  const payment = setUpPass(offer, checkoutCaptchaBox, {
    calculator,
    hooks,
    section,
    config,
    api,
    loadTurnstile,
    passes,
    session,
    tr,
    paperTr,
    events,
  });

  const reviews = keptReviews(session, section);
  const sessionId = returnedSession(arrival);

  if (reviews) {
    upload.showCalculator(false);
    reviews.forEach((entries, i) => {
      if (i > 0) section.basket?.startNext();
      calculator.fill(entries);
      calculator.review();
    });
  } else if (sessionId === null && section.steps.includes(stepOfHash(arrival.hash)))
    upload.showCalculator(false);
  else upload.showStart();

  // Back from Stripe with a session id: the pass is asked for, so the result shows the downloads.
  if (sessionId !== null)
    void payment.returned(sessionId).then((outcome) => {
      if (!reviews)
        upload.notice(
          outcome === true
            ? tr('client.documents.pass.lost')
            : tr(`client.documents.error.${outcome}`),
        );
    });

  return {
    fillRead: (prefill) => upload.fillRead(prefill),
    showStart: () => upload.showStart(true),
  };
}
