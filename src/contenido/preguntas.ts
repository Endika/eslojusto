import { t } from '../i18n';
import type { Idioma } from '../i18n/idiomas';
import { PREGUNTAS, temaAyuda } from './temas';

// The same questions feed the visible FAQ and its FAQPage JSON-LD, so they can't drift apart.
// Each one is `faq.<id>` (question) and `faq.<id>_r` (answer) in the dictionary.
export const preguntas = (
  idioma: Idioma,
): readonly { tema: string; pregunta: string; respuesta: string }[] =>
  PREGUNTAS.map((id) => ({
    tema: temaAyuda(id),
    pregunta: t(idioma, `faq.${id}`),
    respuesta: t(idioma, `faq.${id}_r`),
  }));

// A node for the page's @graph; Base adds the @context.
export const faqPage = (idioma: Idioma) => ({
  '@type': 'FAQPage',
  mainEntity: preguntas(idioma).map(({ pregunta, respuesta }) => ({
    '@type': 'Question',
    name: pregunta,
    acceptedAnswer: { '@type': 'Answer', text: respuesta },
  })),
});
