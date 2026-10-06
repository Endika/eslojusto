// The only host the pages may connect to, and only in a build that has an analytics key.
export const ORIGEN_ANALITICA = 'https://eu.i.posthog.com';

export const politicaDeSeguridad = ({
  hashTema,
  analitica,
}: {
  hashTema: string;
  analitica: boolean;
}): string =>
  [
    "default-src 'self'",
    `script-src 'self' ${hashTema}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self' data:",
    `connect-src ${analitica ? ORIGEN_ANALITICA : "'none'"}`,
    "form-action 'none'",
    "base-uri 'self'",
  ].join('; ');
