interface ImportMetaEnv {
  // PostHog EU project key; unset, the site measures nothing.
  readonly PUBLIC_POSTHOG_KEY?: string;
  // The document-reading and payment API, one function URL per operation; unless all three and
  // the Turnstile site key are set, the site never mentions either.
  readonly PUBLIC_API_EXTRACT_URL?: string;
  readonly PUBLIC_API_CHECKOUT_URL?: string;
  readonly PUBLIC_API_PASS_URL?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
}
