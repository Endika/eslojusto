import { traductorDeLaPagina } from '../i18n/cliente';
import { vigilarErrores } from '../medicion/errores';
import { idiomaPrincipal, mostrarOtroIdioma, vigilarTraduccion } from '../medicion/idioma';
import { iniciarMedicion, medir } from '../medicion/posthog';

// Runs once per page view and writes nothing to the browser's storage.
vigilarErrores(window, medir);
iniciarMedicion();
medir('idioma_navegador', { idioma: idiomaPrincipal(navigator.languages) });
vigilarTraduccion(document.documentElement, (idioma) => medir('idioma_traducido', { idioma }));
mostrarOtroIdioma(document, navigator.languages, traductorDeLaPagina());
