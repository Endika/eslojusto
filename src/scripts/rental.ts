import { RENTAL_TABLES } from '../engine/rental/data/tables';
import { pageTranslator } from '../i18n/client';
import { setUpRental } from '../rental/main';
import type { RentalEvents } from '../rental/ports';
import { localToday } from './clock';

// The rental review measures nothing yet: its events reach no one until they have a catalogue.
const quiet: RentalEvents = {
  stepShown() {},
  stepCompleted() {},
  wentBack() {},
  fieldRejected() {},
  outOfScope() {},
  reviewCompleted() {},
  startedOver() {},
};

// Without the documents API and its pass, the result shows its detail in full.
setUpRental(document.body, {
  events: quiet,
  today: localToday,
  tr: pageTranslator(),
  tables: RENTAL_TABLES,
  detail: () => 'unlocked',
});
