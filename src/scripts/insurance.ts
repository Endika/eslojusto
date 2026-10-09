import { INSURANCE_NORMS } from '../engine/insurance/data/norms';
import { pageTranslator } from '../i18n/client';
import { setUpInsurance } from '../insurance/main';
import type { InsuranceEvents } from '../insurance/ports';
import { localToday } from './clock';

// The insurance review measures nothing yet: no event of it is in the analytics catalogue.
const events: InsuranceEvents = { stepShown() {}, wentBack() {} };

setUpInsurance(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: { norms: INSURANCE_NORMS },
});
