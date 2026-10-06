export type Idioma = 'es' | 'ar-test';

export const IDIOMA_POR_DEFECTO: Idioma = 'es';

// A language is published (`publicado: true`) only after a native speaker has reviewed every
// string in its dictionary. Until then it builds no route and appears in no hreflang.
// `ar-test` is a pseudo-locale that only exists to prove the RTL layout; it is never published.
export const IDIOMAS: Record<Idioma, { nombre: string; dir: 'ltr' | 'rtl'; publicado: boolean }> = {
  es: { nombre: 'Español', dir: 'ltr', publicado: true },
  'ar-test': { nombre: 'Pseudo RTL (solo pruebas)', dir: 'rtl', publicado: false },
};

const todos = Object.keys(IDIOMAS) as Idioma[];

export const idiomasPublicados = (): Idioma[] => todos.filter((i) => IDIOMAS[i].publicado);

// The languages a build emits routes for: the published ones, plus ar-test under PRUEBA_RTL=1.
export const idiomasConstruidos = (
  entorno: Record<string, string | undefined> = process.env,
): Idioma[] => [
  ...idiomasPublicados(),
  ...(entorno['PRUEBA_RTL'] === '1' ? (['ar-test'] as const) : []),
];

// The prefix of a language's routes: none for the default language.
export const prefijo = (idioma: Idioma): string =>
  idioma === IDIOMA_POR_DEFECTO ? '' : `${idioma}/`;

// A page's URL in a language, under the site's base.
export const enlace = (idioma: Idioma, ruta = ''): string =>
  `${import.meta.env.BASE_URL}${prefijo(idioma)}${ruta}`;

// getStaticPaths for a page under `[idioma]/`: every built language but the default one, so a
// normal build (Spanish only) emits no route there.
export const rutasDeIdioma = () =>
  idiomasConstruidos()
    .filter((idioma) => idioma !== IDIOMA_POR_DEFECTO)
    .map((idioma) => ({ params: { idioma } }));
