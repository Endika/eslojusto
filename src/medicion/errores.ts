import { ORIGEN_SCRIPT, TIPOS_ERROR, type Props } from './eventos';

type PropsError = Props<'error_js'>;

// Only the file's base name and the line: a URL's path, query or hash never leaves.
function origenDe(url: string | undefined, linea: number | undefined): string {
  const fichero = url?.split(/[?#]/)[0]?.split('/').pop() ?? '';
  return fichero && linea ? `${fichero}:${linea}` : 'desconocido';
}

// A stack frame line: V8's `    at f (https://…:12:34)` or Firefox/Safari's `f@https://…:12:34`.
const MARCO = /^\s*(?:at\s+(?:.*\()?|[^@\s]*@)(https?:\/\/[^\s()]+):(\d+):\d+\)?\s*$/;

// V8 starts the stack with `Name: message`, which may span lines and quote input: skip it.
function primerMarco(error: Error): RegExpExecArray | null {
  let pila = error.stack ?? '';
  const cabecera = String(error);
  if (pila.startsWith(cabecera)) pila = pila.slice(cabecera.length);
  for (const linea of pila.split('\n')) {
    const marco = MARCO.exec(linea);
    if (marco) return marco;
  }
  return null;
}

// The error's message can quote what the visitor typed, so it never leaves.
export function propsDeError(error: unknown, url?: string, linea?: number): PropsError {
  const nombre = error instanceof Error || error instanceof DOMException ? error.name : '';
  const tipo = (TIPOS_ERROR as readonly string[]).includes(nombre)
    ? (nombre as PropsError['tipo'])
    : 'otro';
  let origen = origenDe(url, linea);
  if (origen === 'desconocido' && error instanceof Error) {
    const marco = primerMarco(error);
    if (marco) origen = origenDe(marco[1], Number(marco[2]));
  }
  return { tipo, origen: ORIGEN_SCRIPT.test(origen) ? origen : 'desconocido' };
}

export function vigilarErrores(
  ventana: Window,
  medir: (evento: 'error_js', props: PropsError) => void,
): void {
  ventana.addEventListener('error', (e) =>
    medir('error_js', propsDeError(e.error, e.filename, e.lineno)),
  );
  ventana.addEventListener('unhandledrejection', (e) =>
    medir('error_js', propsDeError((e as PromiseRejectionEvent).reason)),
  );
}
