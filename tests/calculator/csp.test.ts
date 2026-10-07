import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { contentSecurityPolicy } from '../../src/layouts/csp';

const connectSrc = (csp: string) => csp.split('; ').find((d) => d.startsWith('connect-src'));

describe('CSP', () => {
  it('without an analytics key, the page can connect to nobody', () => {
    const csp = contentSecurityPolicy({ themeHash: "'sha256-x'", analytics: false });
    expect(connectSrc(csp)).toBe("connect-src 'none'");
    expect(csp).not.toContain('posthog');
  });
  it('with a key, it can only connect to PostHog EU', () => {
    const csp = contentSecurityPolicy({ themeHash: "'sha256-x'", analytics: true });
    expect(connectSrc(csp)).toBe('connect-src https://eu.i.posthog.com');
    expect(csp).toContain("script-src 'self' 'sha256-x'");
    expect(csp.match(/posthog/g)).toHaveLength(1);
  });
});

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

// The last build may have had the test key (the analytics e2e) or the documents API (the
// documents e2e); the home page tells which.
const home = existsSync('dist/index.html') ? readFileSync('dist/index.html', 'utf8') : null;
const keylessBuild = home !== null && !home.includes('posthog') && !home.includes('cloudflare');

describe.skipIf(!keylessBuild)('a keyless build tracks nothing', () => {
  const all = keylessBuild ? files('dist') : [];
  it("every page declares connect-src 'none'", () => {
    const html = all.filter((p) => p.endsWith('.html'));
    expect(html.length).toBeGreaterThan(0);
    for (const p of html) expect(readFileSync(p, 'utf8'), p).toContain("connect-src 'none'");
  });
  it('no script carries the PostHog SDK or its address', () => {
    for (const p of all.filter((f) => f.endsWith('.js'))) {
      const js = readFileSync(p, 'utf8');
      expect(js, p).not.toContain('eu.i.posthog.com');
      // The SDK's own event name; our allowlist only names `$pageview_id`.
      expect(js, p).not.toMatch(/["'`]\$pageview["'`]/);
      // Nor the document events, their error codes or Turnstile, which only a build with the
      // documents API ships.
      for (const word of ['extraction_completed', 'pass_revoked', 'challenges.cloudflare.com'])
        expect(js, p).not.toContain(word);
    }
  });
});
