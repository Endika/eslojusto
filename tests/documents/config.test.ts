import { describe, expect, it } from 'vitest';
import { documentsConfig } from '../../src/documents/config';
import { contentSecurityPolicy } from '../../src/layouts/csp';

const key = '1x00000000000000000000AA';

const urls = {
  PUBLIC_API_EXTRACT_URL: 'https://abc.lambda-url.eu-south-2.on.aws/',
  PUBLIC_API_CHECKOUT_URL: 'https://def.lambda-url.eu-south-2.on.aws/',
  PUBLIC_API_PASS_URL: 'https://ghi.lambda-url.eu-south-2.on.aws/',
};

describe('documentsConfig', () => {
  it('is off unless all three function URLs and the Turnstile key are set', () => {
    expect(documentsConfig({})).toBeNull();
    expect(documentsConfig(urls)).toBeNull();
    expect(documentsConfig({ PUBLIC_TURNSTILE_SITE_KEY: key })).toBeNull();
    for (const name of Object.keys(urls)) {
      expect(
        documentsConfig({ ...urls, [name]: undefined, PUBLIC_TURNSTILE_SITE_KEY: key }),
      ).toBeNull();
      expect(documentsConfig({ ...urls, [name]: '', PUBLIC_TURNSTILE_SITE_KEY: key })).toBeNull();
    }
  });
  it('takes only https URLs without query or fragment', () => {
    for (const bad of ['http://a.test/', 'not a url', 'https://a.test/?x=1', 'https://a.test/#x'])
      expect(
        documentsConfig({ ...urls, PUBLIC_API_PASS_URL: bad, PUBLIC_TURNSTILE_SITE_KEY: key }),
        bad,
      ).toBeNull();
  });
  it('posts to each URL as given and lists their origins once', () => {
    expect(documentsConfig({ ...urls, PUBLIC_TURNSTILE_SITE_KEY: key })).toEqual({
      endpoints: {
        extract: 'https://abc.lambda-url.eu-south-2.on.aws/',
        checkout: 'https://def.lambda-url.eu-south-2.on.aws/',
        pass: 'https://ghi.lambda-url.eu-south-2.on.aws/',
      },
      origins: [
        'https://abc.lambda-url.eu-south-2.on.aws',
        'https://def.lambda-url.eu-south-2.on.aws',
        'https://ghi.lambda-url.eu-south-2.on.aws',
      ],
      turnstileSiteKey: key,
    });
    const shared = documentsConfig({
      PUBLIC_API_EXTRACT_URL: 'https://api.test/extract',
      PUBLIC_API_CHECKOUT_URL: 'https://api.test/checkout',
      PUBLIC_API_PASS_URL: 'https://api.test/pass',
      PUBLIC_TURNSTILE_SITE_KEY: key,
    });
    expect(shared?.origins).toEqual(['https://api.test']);
  });
});

describe('the CSP of a build that reads documents', () => {
  const directive = (csp: string, name: string) =>
    csp.split('; ').find((d) => d.startsWith(`${name} `));
  it('adds the API, Turnstile and the thumbnails’ blob: images, and nothing else', () => {
    const csp = contentSecurityPolicy({
      themeHash: "'sha256-x'",
      analytics: false,
      documents: ['https://a.test', 'https://b.test', 'https://c.test'],
    });
    expect(directive(csp, 'connect-src')).toBe(
      'connect-src https://a.test https://b.test https://c.test https://challenges.cloudflare.com',
    );
    expect(directive(csp, 'script-src')).toBe(
      "script-src 'self' 'sha256-x' https://challenges.cloudflare.com",
    );
    expect(directive(csp, 'frame-src')).toBe('frame-src https://challenges.cloudflare.com');
    expect(directive(csp, 'img-src')).toBe("img-src 'self' data: blob:");
    expect(directive(csp, 'worker-src')).toBe("worker-src 'self'");
    expect(directive(csp, 'form-action')).toBe("form-action 'none'");
    const off = contentSecurityPolicy({ themeHash: "'sha256-x'", analytics: false });
    expect(directive(off, 'img-src')).toBe("img-src 'self' data:");
    expect(directive(off, 'worker-src')).toBeUndefined();
  });
  it('keeps PostHog alongside when analytics are on', () => {
    const csp = contentSecurityPolicy({
      themeHash: "'sha256-x'",
      analytics: true,
      documents: ['https://a.test', 'https://b.test', 'https://c.test'],
    });
    expect(directive(csp, 'connect-src')).toBe(
      'connect-src https://eu.i.posthog.com https://a.test https://b.test https://c.test https://challenges.cloudflare.com',
    );
  });
  it('without it, the policy is the same as before', () => {
    const csp = contentSecurityPolicy({ themeHash: "'sha256-x'", analytics: false });
    expect(csp).not.toContain('frame-src');
    expect(csp).not.toContain('cloudflare');
  });
});
