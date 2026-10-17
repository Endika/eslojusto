import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE = 'dist/alquiler/irav-ipc/index.html';
const built = existsSync(PAGE);

describe.skipIf(!built)('the rent indices page', () => {
  it('links to the review and never calls it coming soon', () => {
    const html = readFileSync(PAGE, 'utf8');
    expect(html).toContain('href="/alquiler/"');
    expect(html).not.toContain('Próximamente');
    expect(html).not.toContain('Aún no está disponible');
  });
});
