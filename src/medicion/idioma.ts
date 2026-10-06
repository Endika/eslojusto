import type { Traducir } from '../i18n/cliente';

// The primary subtag of a BCP 47 tag ('ja-JP' → 'ja'); anything else is 'desconocido'.
export function idiomaPrincipal(idiomas: readonly string[]): string {
  const primaria = (idiomas[0] ?? '').split('-')[0]?.toLowerCase() ?? '';
  return /^[a-z]{2,3}$/.test(primaria) ? primaria : 'desconocido';
}

const TRADUCIDA = /\btranslated-(?:ltr|rtl)\b/;
// A translator that marks the page without changing its language still counts, once this passes.
const ESPERA_IDIOMA_MS = 1500;

// Browser translators (Chrome, Edge, Google Translate) add `translated-ltr|rtl` to <html> and
// set its `lang` to the target language. Reports that language once, then stops watching.
export function vigilarTraduccion(html: HTMLElement, alTraducir: (idioma: string) => void): void {
  const original = html.lang;
  let hecho = false;
  let espera: ReturnType<typeof setTimeout> | undefined;
  const avisar = () => {
    if (hecho) return;
    hecho = true;
    clearTimeout(espera);
    observador.disconnect();
    alTraducir(html.lang === original ? 'desconocido' : idiomaPrincipal([html.lang]));
  };
  const observador = new MutationObserver(() => {
    if (html.lang !== original) avisar();
    else if (TRADUCIDA.test(html.className) && espera === undefined)
      espera = setTimeout(avisar, ESPERA_IDIOMA_MS);
  });
  observador.observe(html, { attributes: true, attributeFilter: ['class', 'lang'] });
}

const SVG = 'http://www.w3.org/2000/svg';

function iconoCerrar(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  const atributos = { viewBox: '0 0 24 24', width: '20', height: '20', 'aria-hidden': 'true' };
  for (const [k, v] of Object.entries(atributos)) svg.setAttribute(k, v);
  const trazo = doc.createElementNS(SVG, 'path');
  trazo.setAttribute('d', 'M6 6l12 12M18 6 6 18');
  svg.append(trazo);
  return svg;
}

export interface OtroIdioma {
  readonly codigo: string;
  readonly nombre: string;
  readonly url: string;
}

// Another published language of this page that matches the browser's, for a visitor on Spanish.
export function idiomaSugerido(
  navegador: readonly string[],
  otros: readonly OtroIdioma[],
  actual: string,
): OtroIdioma | null {
  const suyo = idiomaPrincipal(navegador);
  if (actual !== 'es' || suyo === 'es') return null;
  return otros.find((o) => idiomaPrincipal([o.codigo]) === suyo) ?? null;
}

// Offers the page in the browser's language, if it is published; it never redirects. Closing
// it lasts for this page view: nothing is stored.
export function mostrarOtroIdioma(doc: Document, navegador: readonly string[], tr: Traducir): void {
  const datos = doc.getElementById('otros-idiomas')?.textContent;
  if (!datos) return;
  const sugerido = idiomaSugerido(
    navegador,
    JSON.parse(datos) as OtroIdioma[],
    doc.documentElement.lang,
  );
  if (!sugerido) return;
  const destino = new URL(sugerido.url, doc.location.href);
  if (destino.origin !== doc.location.origin) return;

  const barra = doc.createElement('aside');
  barra.className = 'otro-idioma';
  barra.setAttribute('aria-label', tr('cli.otro_idioma.aria'));
  const texto = doc.createElement('p');
  const enlace = doc.createElement('a');
  enlace.href = destino.pathname;
  enlace.hreflang = sugerido.codigo;
  enlace.lang = sugerido.codigo;
  enlace.textContent = sugerido.nombre;
  const [antes = '', despues = ''] = tr('cli.otro_idioma.texto').split('{idioma}');
  texto.append(antes, enlace, despues);
  const cerrar = doc.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'otro-idioma__cerrar';
  cerrar.setAttribute('aria-label', tr('cli.otro_idioma.cerrar'));
  cerrar.append(iconoCerrar(doc));
  cerrar.addEventListener('click', () => barra.remove());
  barra.append(texto, cerrar);
  (doc.querySelector('.suelo') ?? doc.body).prepend(barra);
}
