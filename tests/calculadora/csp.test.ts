import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { politicaDeSeguridad } from '../../src/layouts/csp';

const conectar = (csp: string) => csp.split('; ').find((d) => d.startsWith('connect-src'));

describe('CSP', () => {
  it('sin clave de analítica, la página no puede conectar con nadie', () => {
    const csp = politicaDeSeguridad({ hashTema: "'sha256-x'", analitica: false });
    expect(conectar(csp)).toBe("connect-src 'none'");
    expect(csp).not.toContain('posthog');
  });
  it('con clave, solo puede conectar con PostHog UE', () => {
    const csp = politicaDeSeguridad({ hashTema: "'sha256-x'", analitica: true });
    expect(conectar(csp)).toBe('connect-src https://eu.i.posthog.com');
    expect(csp).toContain("script-src 'self' 'sha256-x'");
    expect(csp.match(/posthog/g)).toHaveLength(1);
  });
});

const ficheros = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? ficheros(p) : [p];
  });

// The last build may have had the test key (the measurement e2e); the home page tells which.
const compilacionSinClave =
  existsSync('dist/index.html') && !readFileSync('dist/index.html', 'utf8').includes('posthog');

describe.skipIf(!compilacionSinClave)('una compilación sin clave no mide nada', () => {
  const todos = compilacionSinClave ? ficheros('dist') : [];
  it("cada página declara connect-src 'none'", () => {
    const html = todos.filter((p) => p.endsWith('.html'));
    expect(html.length).toBeGreaterThan(0);
    for (const p of html) expect(readFileSync(p, 'utf8'), p).toContain("connect-src 'none'");
  });
  it('ningún script lleva el SDK de PostHog ni su dirección', () => {
    for (const p of todos.filter((f) => f.endsWith('.js'))) {
      const js = readFileSync(p, 'utf8');
      expect(js, p).not.toContain('eu.i.posthog.com');
      // The SDK's own event name; our allowlist only names `$pageview_id`.
      expect(js, p).not.toMatch(/["'`]\$pageview["'`]/);
    }
  });
});
