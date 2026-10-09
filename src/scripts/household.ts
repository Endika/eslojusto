import { householdAnalytics } from '../analytics/household';
import { track } from '../analytics/posthog';
import { HOUSEHOLD_NORMS } from '../engine/household/data/norms';
import { MINIMUM_WAGE } from '../engine/employment/data/minimum-wage';
import { pageTranslator } from '../i18n/client';
import { setUpHousehold } from '../household/main';
import { localToday } from './clock';

setUpHousehold(document.body, {
  events: householdAnalytics(track, () => performance.now()),
  today: localToday,
  tr: pageTranslator(),
  tables: { norms: HOUSEHOLD_NORMS, minimumWage: MINIMUM_WAGE },
});
