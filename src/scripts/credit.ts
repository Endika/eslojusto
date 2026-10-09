import { CREDIT_NORMS } from '../engine/credit/data/norms';
import { CREDIT_SOURCES } from '../engine/credit/data/sources';
import { BE1904 } from '../engine/credit/data/be1904';
import { setUpCredit } from '../credit/main';
import type { CreditEvents } from '../credit/ports';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

// The credit review measures nothing yet: no event of it is in the analytics catalogue.
const events: CreditEvents = { stepShown() {}, wentBack() {} };

setUpCredit(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: {
    norms: CREDIT_NORMS,
    sources: CREDIT_SOURCES,
    rates: {
      'BE_19_4.7': BE1904['BE_19_4.7'],
      'BE_19_4.9': BE1904['BE_19_4.9'],
      'BE_19_4.10': BE1904['BE_19_4.10'],
      'BE_19_4.11': BE1904['BE_19_4.11'],
    },
  },
});
