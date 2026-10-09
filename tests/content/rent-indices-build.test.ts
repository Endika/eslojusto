import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const PAGE = 'dist/alquiler/irav-ipc/index.html';
const built = existsSync(PAGE);
const withRental = built && existsSync('dist/alquiler/index.html');

// With /alquiler/ published, the indices page points to it instead of announcing it.
describe.skipIf(!withRental)('the rent indices page in a build with the rental switch', () => {
  it('links to the review and never calls it coming soon', () => {
    const html = readFileSync(PAGE, 'utf8');
    expect(html).toContain('href="/alquiler/"');
    expect(html).not.toContain('Próximamente');
    expect(html).not.toContain('Aún no está disponible');
  });
});

describe.skipIf(!built || withRental)('the rent indices page in a build without it', () => {
  it('still says the review is coming', () => {
    expect(readFileSync(PAGE, 'utf8')).toContain('Próximamente: comprueba tu subida');
  });
});
