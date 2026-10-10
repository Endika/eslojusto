import { LEGAL_INTEREST } from '../engine/law/data/legal-interest';
import { MORTGAGE_NORMS } from '../engine/mortgage/data/norms';
import { MORTGAGE_SOURCES } from '../engine/mortgage/data/sources';
import { CASE_LAW_RULES } from '../engine/mortgage/rules';
import { setUpMortgage } from '../mortgage/main';
import type { MortgageEvents } from '../mortgage/ports';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

// The mortgage review measures nothing yet: no event of it is in the analytics catalogue.
const events: MortgageEvents = {
  stepShown() {},
  wentBack() {},
  stepCompleted() {},
  fieldRejected() {},
  helpOpened() {},
  startedOver() {},
};

setUpMortgage(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: {
    norms: MORTGAGE_NORMS,
    sources: MORTGAGE_SOURCES,
    criteria: CASE_LAW_RULES,
    legalInterest: LEGAL_INTEREST,
  },
});
