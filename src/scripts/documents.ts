import { documentsAnalytics } from '../analytics/documents';
import { track } from '../analytics/posthog';
import type { FormEntries } from '../calculator/fill';
import type { Calculator } from '../calculator/main';
import type { CompletedReview } from '../calculator/ports';
import { STEPS } from '../calculator/steps';
import { createApi } from '../documents/api';
import { DOCUMENTS, TURNSTILE_SCRIPT, type DocumentsConfig } from '../documents/config';
import { fitWithin } from '../documents/files';
import { canvasJpeg, whiteCanvas } from './jpeg';
import { createOutageMemory } from '../documents/outage';
import { createPassStore } from '../documents/pass';
import { setUpPayment } from '../documents/payment';
import type {
  Browser,
  Captcha,
  CaptchaAction,
  FileEncoder,
  KeyValueStore,
  PdfPages,
} from '../documents/ports';
import { setUpUpload } from '../documents/upload';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

// The review's answers while the person is on Stripe's page; read back and deleted on return.
const REVIEW_KEY = 'eslojusto-revision-en-pago';
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

// Turnstile loads only when a document is about to be read or the pass paid for, and each of
// those gets a fresh token.
let turnstileApi: Promise<Turnstile> | null = null;
const loadTurnstile = () =>
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

function turnstileCaptcha(siteKey: string, container: HTMLElement, action: CaptchaAction): Captcha {
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
          language: document.documentElement.lang === 'es' ? 'es' : 'auto',
          callback: (token: string) => done(() => resolve(token))(),
          'error-callback': done(() => reject(new Error('Turnstile error'))),
          'expired-callback': done(() => reject(new Error('Turnstile expired'))),
          'timeout-callback': done(() => reject(new Error('Turnstile timeout'))),
        });
      });
    },
  };
}

// Photos are drawn on a canvas at most 1568 px on their long side and leave as JPEG.
const canvasEncoder: FileEncoder = {
  async encode(file, maxBytes) {
    const bitmap = await createImageBitmap(file);
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const { canvas, context } = whiteCanvas(width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvasJpeg(canvas, maxBytes);
  },
};

// pdf.js and its worker load only when a PDF is picked, from this site.
const pdfPages: PdfPages = {
  open: (file) => import('./pdf-pages').then((m) => m.pdfPages.open(file)),
};

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
};

export interface CalculatorHooks {
  onReview(listener: (r: CompletedReview) => void): void;
  onRestart(listener: () => void): void;
}

const isEntries = (v: unknown): v is FormEntries =>
  Array.isArray(v) &&
  v.every(
    (e) => Array.isArray(e) && e.length === 2 && e.every((x: unknown) => typeof x === 'string'),
  );

export function wireDocuments(
  calculator: Calculator,
  hooks: CalculatorHooks,
  // The address the visit arrived at, before the calculator rewrote its fragment.
  arrival: { hash: string; search: string },
  config: DocumentsConfig | null = DOCUMENTS,
): void {
  const start = document.querySelector<HTMLElement>('[data-documents-start]');
  const offer = document.querySelector<HTMLElement>('[data-pass-offer]');
  const captchaBox = start?.querySelector<HTMLElement>('[data-captcha]');
  const checkoutCaptchaBox = offer?.querySelector<HTMLElement>('[data-pass-captcha]');
  if (!config || !start || !offer || !captchaBox || !checkoutCaptchaBox) return;

  const tr = pageTranslator();
  const api = createApi(config.endpoints, (url, init) => fetch(url, init));
  const passes = createPassStore(
    storage(() => localStorage),
    browser.now,
  );
  const session = storage(() => sessionStorage);
  const events = documentsAnalytics(track);

  const upload = setUpUpload(start, {
    api,
    captcha: turnstileCaptcha(config.turnstileSiteKey, captchaBox, 'extract'),
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
  const payment = setUpPayment(offer, {
    api,
    captcha: turnstileCaptcha(config.turnstileSiteKey, checkoutCaptchaBox, 'checkout'),
    passes,
    events,
    browser,
    tr,
    pdf: () => import('../documents/pdf').then((m) => m.pdfMaker(tr, localToday)),
    keepReview: () => session.set(REVIEW_KEY, JSON.stringify(calculator.entries())),
  });
  hooks.onReview((r) => {
    payment.show(r);
    upload.showAgreementOffer(document);
  });
  hooks.onRestart(() => payment.hide());

  // The answers kept for the trip to Stripe come back on any return, paid or not (cancelling or
  // the browser's back button arrive without a session id), and are deleted at once.
  let saved: unknown = null;
  try {
    saved = JSON.parse(session.get(REVIEW_KEY) ?? 'null');
  } catch {
    // A damaged entry is dropped below like any other.
  }
  session.remove(REVIEW_KEY);
  const review = isEntries(saved) ? saved : null;

  const sessionId = new URLSearchParams(arrival.search).get('session_id');
  if (sessionId !== null) history.replaceState(null, '', `${location.pathname}${location.hash}`);

  if (review) {
    calculator.fill(review);
    upload.showCalculator(false);
    calculator.review();
  } else if (sessionId === null && (STEPS as readonly string[]).includes(arrival.hash.slice(1)))
    upload.showCalculator(false);
  else upload.showStart();

  // Back from Stripe with a session id: the pass is asked for, so the result shows the downloads.
  if (sessionId !== null)
    void payment.returned(sessionId).then((outcome) => {
      if (!review)
        upload.notice(
          outcome === true
            ? tr('client.documents.pass.lost')
            : tr(`client.documents.error.${outcome}`),
        );
    });
}
