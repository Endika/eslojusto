import { SCRIPT_SOURCE, ERROR_TYPES, type Props } from './events';

type ErrorProps = Props<'js_error'>;

const MAX_FRAMES = 5;
const MAX_MESSAGE = 160;

// V8's `    at f (https://…:12:34)` or `    at https://…:12:34`; Firefox and Safari's `f@https://…:12:34`.
// Only http(s) scripts match: extension and other schemes never do.
const FRAME = /^\s*(?:at\s+(?:.*\()?|[^@(]*@)(https?:\/\/[^\s()]+):(\d+):(\d+)\)?\s*$/;

// Only the file's base name and the position: a URL's path, query or hash never leaves.
function frameOf(url: string, line: number, column: number, origin: string): string | null {
  let file: string;
  try {
    const u = new URL(url);
    if (/^https?:$/.test(new URL(origin).protocol) && u.origin !== origin) return null;
    file = u.pathname.split('/').pop() ?? '';
  } catch {
    return null;
  }
  const frame = `${file}:${line}:${column}`;
  return SCRIPT_SOURCE.test(frame) ? frame : null;
}

// V8 starts the stack with `Name: message`, which may span lines and quote input: skip it.
export function stackFrames(error: Error, origin: string): string[] {
  let stack = error.stack ?? '';
  const header = String(error);
  if (stack.startsWith(header)) stack = stack.slice(header.length);
  const frames: string[] = [];
  for (const line of stack.split('\n')) {
    const m = FRAME.exec(line);
    const frame = m && frameOf(m[1] as string, Number(m[2]), Number(m[3]), origin);
    if (frame) frames.push(frame);
    if (frames.length === MAX_FRAMES) break;
  }
  return frames;
}

// Browsers word an error from a template and put the values in quotes or digits: those spans go.
const LEAKS = /@|:\/\/|www\.|\b[a-z0-9-]+\.(?:com|es|org|net|io|eu|gov|edu|info|me|app|dev|co)\b/i;

export function sanitizeMessage(message: string): string {
  const template = message
    .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, (q) => `${q[0]}…${q.at(-1)}`)
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE);
  return LEAKS.test(template) ? '' : template;
}

// The sheet on screen: the hash when it names one (`#sheet-<id>`), else nothing.
function stepOf(hash: string): string {
  return /^#(?:sheet-)?([a-z0-9-]{1,30})$/.exec(hash)?.[1] ?? '';
}

function here(): { origin: string; hash: string } {
  return typeof location === 'undefined'
    ? { origin: 'null', hash: '' }
    : { origin: location.origin, hash: location.hash };
}

export function errorProps(
  error: unknown,
  at?: { filename?: string; lineno?: number; colno?: number },
  page = here(),
): ErrorProps {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  const kind = (ERROR_TYPES as readonly string[]).includes(name)
    ? (name as ErrorProps['kind'])
    : 'other';
  let frames = error instanceof Error ? stackFrames(error, page.origin) : [];
  if (frames.length === 0 && at?.filename && at.lineno && at.colno) {
    const frame = frameOf(at.filename, at.lineno, at.colno, page.origin);
    if (frame) frames = [frame];
  }
  const text = error instanceof Error ? error.message : '';
  return {
    kind,
    frames,
    version: import.meta.env.PUBLIC_SITE_VERSION ?? '0.0.0',
    message: sanitizeMessage(text),
    step: stepOf(page.hash),
  };
}

export function watchErrors(
  target: Window,
  track: (event: 'js_error', props: ErrorProps) => void,
): void {
  target.addEventListener('error', (e) => track('js_error', errorProps(e.error, e)));
  target.addEventListener('unhandledrejection', (e) =>
    track('js_error', errorProps((e as PromiseRejectionEvent).reason)),
  );
}
