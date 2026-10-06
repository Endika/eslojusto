import { t } from '../i18n';
import type { Idioma } from '../i18n/idiomas';

// schema.org nodes for each page's @graph. Only what is true of the site: no ratings, no prices.
const NOMBRE = 'eslojusto.es';
const CORREO = 'hola@eslojusto.es';

const organizacion = (portada: URL) => ({
  '@type': 'Organization',
  '@id': `${portada.href}#organizacion`,
  name: NOMBRE,
  url: portada.href,
});

export const datosPortada = (portada: URL, idioma: Idioma) => [
  {
    '@type': 'WebSite',
    '@id': `${portada.href}#sitio`,
    name: NOMBRE,
    alternateName: 'Es lo justo',
    url: portada.href,
    inLanguage: idioma,
    publisher: { '@id': `${portada.href}#organizacion` },
  },
  {
    ...organizacion(portada),
    logo: new URL('apple-touch-icon.png', portada).href,
    email: CORREO,
    founder: { '@type': 'Person', name: 'Endika Iglesias' },
  },
];

export const calculadora = (portada: URL, pagina: URL, idioma: Idioma) => ({
  '@type': 'WebApplication',
  name: 'Calculadora de finiquito',
  url: pagina.href,
  description: t(idioma, 'finiquito.descripcion'),
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  isAccessibleForFree: true,
  inLanguage: idioma,
  publisher: organizacion(portada),
});
