interface ImportMetaEnv {
  // PostHog EU project key; unset, the site measures nothing.
  readonly PUBLIC_POSTHOG_KEY?: string;
  // The document-reading and payment API, one function URL per operation; unless all three and
  // the Turnstile site key are set, the site never mentions either.
  readonly PUBLIC_API_EXTRACT_URL?: string;
  readonly PUBLIC_API_CHECKOUT_URL?: string;
  readonly PUBLIC_API_PASS_URL?: string;
  readonly PUBLIC_TURNSTILE_SITE_KEY?: string;
  // '1' builds the rental review at /alquiler/; anything else leaves it out.
  readonly PUBLIC_RENTAL?: string;
  // '1' builds the employment contract review at /contrato/; anything else leaves it out.
  readonly PUBLIC_EMPLOYMENT?: string;
  // '1' builds the benefit during an ERTE at /paro/erte/; anything else leaves it out.
  readonly PUBLIC_ERTE?: string;
  // '1' builds the household worker review at /empleada-de-hogar/; anything else leaves it out.
  readonly PUBLIC_HOUSEHOLD?: string;
  // '1' builds the review of a policy's dates at /seguros/; anything else leaves it out.
  readonly PUBLIC_INSURANCE?: string;
  // '1' builds the consumer credit review at /financiacion/; anything else leaves it out.
  readonly PUBLIC_CREDIT?: string;
  // '1' builds the mortgage review at /hipoteca/; anything else leaves it out.
  readonly PUBLIC_MORTGAGE?: string;
}
