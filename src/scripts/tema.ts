import { traductorDeLaPagina } from '../i18n/cliente';

type Tema = 'light' | 'dark';

const raiz = document.documentElement;
const tr = traductorDeLaPagina();
const sistema = matchMedia('(prefers-color-scheme: dark)');

function guardado(): Tema | null {
  try {
    const t = localStorage.getItem('tema');
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function aplicar(tema: Tema) {
  raiz.dataset['theme'] = tema;
  for (const boton of document.querySelectorAll('[data-tema]'))
    boton.setAttribute(
      'aria-label',
      tr(tema === 'dark' ? 'cli.tema.a_claro' : 'cli.tema.a_oscuro'),
    );
}

aplicar(guardado() ?? (sistema.matches ? 'dark' : 'light'));

sistema.addEventListener('change', (e) => {
  if (guardado() === null) aplicar(e.matches ? 'dark' : 'light');
});

for (const boton of document.querySelectorAll('[data-tema]')) {
  boton.addEventListener('click', () => {
    const nuevo: Tema = raiz.dataset['theme'] === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('tema', nuevo);
    } catch {
      // Without storage the choice lasts until the page reloads.
    }
    aplicar(nuevo);
  });
}
