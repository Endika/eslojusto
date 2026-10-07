import { describe, expect, it } from 'vitest';
import { documentsConfig } from '../../src/documents/config';
import { contentSecurityPolicy } from '../../src/layouts/csp';

const key = '1x00000000000000000000AA';

describe('documentsConfig', () => {
  it('is off unless both the API and the Turnstile key are set', () => {
    expect(documentsConfig({})).toBeNull();
    expect(documentsConfig({ PUBLIC_API_URL: 'https://api.example.test' })).toBeNull();
    expect(documentsConfig({ PUBLIC_TURNSTILE_SITE_KEY: key })).toBeNull();
    expect(documentsConfig({ PUBLIC_API_URL: '', PUBLIC_TURNSTILE_SITE_KEY: key })).toBeNull();
  });
  it('takes only an https base without query or fragment', () => {
    for (const api of [
      'http://api.example.test',
      'not a url',
      'https://a.test/?x=1',
      'https://a.test/#x',
    ])
      expect(
        documentsConfig({ PUBLIC_API_URL: api, PUBLIC_TURNSTILE_SITE_KEY: key }),
        api,
      ).toBeNull();
  });
  it('keeps the origin apart and drops a trailing slash', () => {
    expect(
      documentsConfig({
        PUBLIC_API_URL: 'https://api.example.test/v1/',
        PUBLIC_TURNSTILE_SITE_KEY: key,
      }),
    ).toEqual({
      apiUrl: 'https://api.example.test/v1',
      apiOrigin: 'https://api.example.test',
      turnstileSiteKey: key,
    });
  });
});

describe('the CSP of a build that reads documents', () => {
  const directive = (csp: string, name: string) =>
    csp.split('; ').find((d) => d.startsWith(`${name} `));
  it('adds the API and Turnstile, and nothing else', () => {
    const csp = contentSecurityPolicy({
      themeHash: "'sha256-x'",
      analytics: false,
      documents: 'https://api.example.test',
    });
    expect(directive(csp, 'connect-src')).toBe(
      'connect-src https://api.example.test https://challenges.cloudflare.com',
    );
    expect(directive(csp, 'script-src')).toBe(
      "script-src 'self' 'sha256-x' https://challenges.cloudflare.com",
    );
    expect(directive(csp, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com');
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data:");
    expect(directive(csp, 'form-action')).toBe("form-action 'none'");
  });
  it('keeps PostHog alongside when analytics are on', () => {
    const csp = contentSecurityPolicy({
      themeHash: "'sha256-x'",
      analytics: true,
      documents: 'https://api.example.test',
    });
    expect(directive(csp, 'connect-src')).toBe(
      'connect-src https://eu.i.posthog.com https://api.example.test https://challenges.cloudflare.com',
    );
  });
  it('without it, the policy is the same as before', () => {
    const csp = contentSecurityPolicy({ themeHash: "'sha256-x'", analytics: false });
    expect(csp).not.toContain('frame-src');
    expect(csp).not.toContain('cloudflare');
  });
});
