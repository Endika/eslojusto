import type { ArticleWatch, WatchedArticle } from '../monthly-review';

const API = 'https://www.boe.es/datosabiertos/api/legislacion-consolidada/id';
const ET_ID = 'BOE-A-2015-11430';
const RD723_ID = 'BOE-A-2026-19200';

const et = (block: string, versionInForceSince: string, lastAmendedBy: string): WatchedArticle => ({
  norm: 'et',
  block,
  apiUrl: `${API}/${ET_ID}/texto/bloque/${block}`,
  versionInForceSince,
  lastAmendedBy,
});

// Versions as returned by the API on 07-10-2026.
export const ARTICLE_WATCH: ArticleWatch = {
  articles: [
    et('a34', '2023-06-30', 'BOE-A-2023-15135'),
    et('a15', '2025-01-02', 'BOE-A-2025-6597'),
    et('a14', '2023-03-02', 'BOE-A-2023-5366'),
    et('a12', '2025-04-01', 'BOE-A-2024-26917'),
    et('a11', '2023-03-02', 'BOE-A-2023-5366'),
    et('a38', '2015-11-13', ET_ID),
    et('a31', '2015-11-13', ET_ID),
    et('a21', '2015-11-13', ET_ID),
    et('a26', '2015-11-13', ET_ID),
    {
      norm: 'rd723_2026',
      block: 'a3',
      apiUrl: `${API}/${RD723_ID}/texto/bloque/a3`,
      versionInForceSince: '2026-10-05',
      lastAmendedBy: RD723_ID,
    },
  ],
  matters: [
    // Bill 121/000058 on a shorter working week, rejected by the Congreso on 10-09-2025.
    {
      id: 'working_week_reduction',
      url: 'https://www.congreso.es/es/proyectos-de-ley?p_p_id=iniciativas&p_p_lifecycle=0&p_p_state=normal&p_p_mode=view&_iniciativas_mode=mostrarDetalle&_iniciativas_legislatura=XV&_iniciativas_id=121%2F000058',
    },
    // A royal decree on a digital time record; art. 34.9 is unchanged until it is published.
    { id: 'digital_time_record', url: 'https://www.boe.es/buscar/boe.php' },
    { id: 'next_minimum_wage', url: 'https://www.boe.es/buscar/boe.php' },
    // Disposición adicional 1.ª RD 723/2026: the public employment service's model document.
    { id: 'sepe_information_model', url: `https://www.boe.es/buscar/act.php?id=${RD723_ID}#da` },
  ],
};
