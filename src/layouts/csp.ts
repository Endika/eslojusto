// The only host the pages may connect to, and only in a build that has an analytics key.
export const ANALYTICS_ORIGIN = 'https://eu.i.posthog.com';

export const contentSecurityPolicy = ({
  themeHash,
  analytics,
}: {
  themeHash: string;
  analytics: boolean;
}): string =>
  [
    "default-src 'self'",
    `script-src 'self' ${themeHash}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src ${analytics ? ANALYTICS_ORIGIN : "'none'"}`,
    "form-action 'none'",
    "base-uri 'self'",
  ].join('; ');
