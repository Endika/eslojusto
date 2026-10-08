import { EMPLOYMENT_NORMS } from '../engine/employment/data/norms';
import { MINIMUM_WAGE } from '../engine/employment/data/minimum-wage';
import { pageTranslator } from '../i18n/client';
import { setUpEmployment } from '../employment/main';
import type { EmploymentEvents } from '../employment/ports';
import { localToday } from './clock';

// The contract review measures nothing yet: its events reach no one until they have a catalogue.
const quiet: EmploymentEvents = {
  stepShown() {},
  stepCompleted() {},
  wentBack() {},
  fieldRejected() {},
  outOfScope() {},
  reviewCompleted() {},
  startedOver() {},
};

// Without the documents API and its pass, the result shows its detail in full.
setUpEmployment(document.body, {
  events: quiet,
  today: localToday,
  tr: pageTranslator(),
  tables: { norms: EMPLOYMENT_NORMS, minimumWage: MINIMUM_WAGE },
  detail: () => 'unlocked',
});
