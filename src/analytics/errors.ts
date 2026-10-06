import { SCRIPT_SOURCE, ERROR_TYPES, type Props } from './events';

type ErrorProps = Props<'js_error'>;

// Only the file's base name and the line: a URL's path, query or hash never leaves.
function sourceOf(url: string | undefined, line: number | undefined): string {
  const file = url?.split(/[?#]/)[0]?.split('/').pop() ?? '';
  return file && line ? `${file}:${line}` : 'unknown';
}

// A stack frame line: V8's `    at f (https://…:12:34)` or Firefox/Safari's `f@https://…:12:34`.
const FRAME = /^\s*(?:at\s+(?:.*\()?|[^@\s]*@)(https?:\/\/[^\s()]+):(\d+):\d+\)?\s*$/;

// V8 starts the stack with `Name: message`, which may span lines and quote input: skip it.
function firstFrame(error: Error): RegExpExecArray | null {
  let stack = error.stack ?? '';
  const header = String(error);
  if (stack.startsWith(header)) stack = stack.slice(header.length);
  for (const line of stack.split('\n')) {
    const frame = FRAME.exec(line);
    if (frame) return frame;
  }
  return null;
}

// The error's message can quote what the visitor typed, so it never leaves.
export function errorProps(error: unknown, url?: string, line?: number): ErrorProps {
  const name = error instanceof Error || error instanceof DOMException ? error.name : '';
  const kind = (ERROR_TYPES as readonly string[]).includes(name)
    ? (name as ErrorProps['kind'])
    : 'other';
  let source = sourceOf(url, line);
  if (source === 'unknown' && error instanceof Error) {
    const frame = firstFrame(error);
    if (frame) source = sourceOf(frame[1], Number(frame[2]));
  }
  return { kind, source: SCRIPT_SOURCE.test(source) ? source : 'unknown' };
}

export function watchErrors(
  target: Window,
  track: (event: 'js_error', props: ErrorProps) => void,
): void {
  target.addEventListener('error', (e) =>
    track('js_error', errorProps(e.error, e.filename, e.lineno)),
  );
  target.addEventListener('unhandledrejection', (e) =>
    track('js_error', errorProps((e as PromiseRejectionEvent).reason)),
  );
}
