import { pageTranslator } from '../i18n/client';

type Theme = 'light' | 'dark';

const root = document.documentElement;
const tr = pageTranslator();
const system = matchMedia('(prefers-color-scheme: dark)');

// The stored key keeps its original name so returning visitors keep their choice; Base.astro reads it too.
const STORAGE_KEY = 'tema';

function stored(): Theme | null {
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  root.dataset['theme'] = theme;
  for (const button of document.querySelectorAll('[data-theme-toggle]'))
    button.setAttribute(
      'aria-label',
      tr(theme === 'dark' ? 'client.theme.to_light' : 'client.theme.to_dark'),
    );
}

apply(stored() ?? (system.matches ? 'dark' : 'light'));

system.addEventListener('change', (e) => {
  if (stored() === null) apply(e.matches ? 'dark' : 'light');
});

for (const button of document.querySelectorAll('[data-theme-toggle]')) {
  button.addEventListener('click', () => {
    const next: Theme = root.dataset['theme'] === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Without storage the choice lasts until the page reloads.
    }
    apply(next);
  });
}
