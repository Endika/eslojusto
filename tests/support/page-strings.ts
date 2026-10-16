import { clientStrings } from '../../src/i18n';
import type { Translate } from '../../src/i18n/client';
import { interpolate } from '../../src/i18n/interpolate';

type Page =
  | 'final-pay'
  | 'rental'
  | 'employment'
  | 'household'
  | 'insurance'
  | 'credit'
  | 'mortgage'
  | 'bills';

// What a page's browser scripts can read: the strings Base.astro ships on it, in a build with
// documents. A key the page does not ship throws, where the browser would print the key itself.
export const pageTranslator = (page: Page): Translate => {
  const strings = clientStrings('es', {
    documents: true,
    ...(page === 'final-pay' ? {} : { [page]: true }),
  });
  return (key, vars) => {
    const text = strings[key];
    if (text === undefined) throw new Error(`${key} does not ship on the ${page} page`);
    return interpolate(text, vars);
  };
};
