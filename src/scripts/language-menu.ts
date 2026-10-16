// The menu opens and closes as a <details> without this; it only closes it on a click elsewhere
// or Escape, as a menu is expected to.
for (const menu of document.querySelectorAll<HTMLDetailsElement>('[data-language-menu]')) {
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
  });
  menu.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !menu.open) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  });
}
