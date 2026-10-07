// Reading documents and the paid pass exist only in a build that names the API and the Turnstile
// site key; without both, no page mentions them and the CSP stays closed.
export interface DocumentsConfig {
  // The API base, without a trailing slash; each operation is a path under it.
  readonly apiUrl: string;
  readonly apiOrigin: string;
  readonly turnstileSiteKey: string;
}

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
export const TURNSTILE_SCRIPT = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
export const CHECKOUT_ORIGIN = 'https://checkout.stripe.com';

type Env = Readonly<Record<string, string | boolean | undefined>>;

export function documentsConfig(env: Env): DocumentsConfig | null {
  const api = env['PUBLIC_API_URL'];
  const siteKey = env['PUBLIC_TURNSTILE_SITE_KEY'];
  if (typeof api !== 'string' || typeof siteKey !== 'string' || !api || !siteKey) return null;
  let url: URL;
  try {
    url = new URL(api);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.search || url.hash) return null;
  return {
    apiUrl: `${url.origin}${url.pathname.replace(/\/+$/, '')}`,
    apiOrigin: url.origin,
    turnstileSiteKey: siteKey,
  };
}

export const DOCUMENTS = documentsConfig(import.meta.env);
