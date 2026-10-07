// Reading documents and the paid pass exist only in a build that names the API's three function
// URLs and the Turnstile site key; without all four, no page mentions them and the CSP stays closed.
export const OPERATIONS = ['extract', 'checkout', 'pass'] as const;
export type Operation = (typeof OPERATIONS)[number];

export interface DocumentsConfig {
  // Each operation is its own function URL, posted to as given.
  readonly endpoints: Readonly<Record<Operation, string>>;
  // The origins those URLs live on, once each, for the CSP.
  readonly origins: readonly string[];
  readonly turnstileSiteKey: string;
}

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
export const CHECKOUT_ORIGIN = 'https://checkout.stripe.com';

// Each env var takes one output of the API's CDK stack: extractUrl, checkoutUrl and passUrl.
export const ENV_NAMES: Readonly<Record<Operation, string>> = {
  extract: 'PUBLIC_API_EXTRACT_URL',
  checkout: 'PUBLIC_API_CHECKOUT_URL',
  pass: 'PUBLIC_API_PASS_URL',
};

type Env = Readonly<Record<string, string | boolean | undefined>>;

function endpoint(value: string | boolean | undefined): URL | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.search && !url.hash ? url : null;
  } catch {
    return null;
  }
}

export function documentsConfig(env: Env): DocumentsConfig | null {
  const siteKey = env['PUBLIC_TURNSTILE_SITE_KEY'];
  if (typeof siteKey !== 'string' || !siteKey) return null;
  const urls = OPERATIONS.map((op) => endpoint(env[ENV_NAMES[op]]));
  if (!urls.every((u): u is URL => u !== null)) return null;
  const [extract, checkout, pass] = urls.map((u) => u.href) as [string, string, string];
  return {
    endpoints: { extract, checkout, pass },
    origins: [...new Set(urls.map((u) => u.origin))],
    turnstileSiteKey: siteKey,
  };
}

// Pure, so a bundle that only imports DOCUMENTS_BUILD behind a folded condition drops it.
export const DOCUMENTS = /* @__PURE__ */ documentsConfig(import.meta.env);

export const DOCUMENTS_BUILD = DOCUMENTS !== null;
