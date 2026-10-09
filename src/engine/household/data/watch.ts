import type { ArticleWatch } from '../monthly-review';
import { RD1620_ID } from './norms';

const API = 'https://www.boe.es/datosabiertos/api/legislacion-consolidada/id';

// The articles the household rules rest on, each with the date of its version in force and the
// law that gave it, as the BOE open data API lists them.
const rd1620 = (
  block: string,
  versionInForceSince: string,
  lastAmendedBy: string,
): ArticleWatch['articles'][number] => ({
  norm: 'rd1620_2011',
  block,
  apiUrl: `${API}/${RD1620_ID}/texto/bloque/${block}`,
  versionInForceSince,
  lastAmendedBy,
});

export const ARTICLE_WATCH: ArticleWatch = {
  articles: [
    // Never amended since the decree itself.
    rd1620('a8', '2011-11-18', RD1620_ID),
    // Last amended by the final provision 5.ª of RDL 16/2013, which added art. 9.3 bis.
    rd1620('a9', '2013-12-22', 'BOE-A-2013-13426'),
    rd1620('a11', '2022-09-09', 'BOE-A-2022-14680'),
  ],
  matters: [{ id: 'next_minimum_wage', url: 'https://www.boe.es/buscar/boe.php' }],
};
