import { ANALYTICS_ORIGIN } from '../analytics/config';
import { TURNSTILE_ORIGIN } from '../documents/config';

// `documents` are the API origins of a build that reads documents; Turnstile's script, frame and
// requests come with them, as Cloudflare documents for a CSP.
export const contentSecurityPolicy = ({
  themeHash,
  analytics,
  documents = null,
}: {
  themeHash: string;
  analytics: boolean;
  documents?: readonly string[] | null;
}): string => {
  const connect = [
    ...(analytics ? [ANALYTICS_ORIGIN] : []),
    ...(documents ? [...documents, TURNSTILE_ORIGIN] : []),
  ];
  return [
    "default-src 'self'",
    `script-src 'self' ${themeHash}${documents ? ` ${TURNSTILE_ORIGIN}` : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    // The thumbnails of the files chosen to read are blob: URLs.
    `img-src 'self' data:${documents ? ' blob:' : ''}`,
    `connect-src ${connect.length > 0 ? connect.join(' ') : "'none'"}`,
    ...(documents ? [`frame-src ${TURNSTILE_ORIGIN}`] : []),
    // pdf.js draws a PDF's pages in a worker served from this site.
    ...(documents ? ["worker-src 'self'"] : []),
    "form-action 'none'",
    "base-uri 'self'",
  ].join('; ');
};
