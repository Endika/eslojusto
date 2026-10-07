import { ANALYTICS_ORIGIN } from '../analytics/config';

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
