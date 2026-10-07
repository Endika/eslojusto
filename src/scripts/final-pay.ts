import { calculatorAnalytics } from '../analytics/calculator';
import { track } from '../analytics/posthog';
import { setUpCalculator } from '../calculator/main';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

setUpCalculator(document.body, {
  events: calculatorAnalytics(track, () => performance.now()),
  today: localToday,
  tr: pageTranslator(),
});
