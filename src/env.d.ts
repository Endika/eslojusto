interface ImportMetaEnv {
  // PostHog EU project key; unset, the site measures nothing.
  readonly PUBLIC_POSTHOG_KEY?: string;
  // The document-reading and payment API; unset, the site never mentions either.
  readonly PUBLIC_API_URL?: string;
  // Cloudflare Turnstile site key for the free reads; required alongside PUBLIC_API_URL.
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}
