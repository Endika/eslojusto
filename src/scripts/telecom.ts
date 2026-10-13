import { BILLS_NORMS } from '../engine/bills/data/norms';
import { BILLS_SOURCES } from '../engine/bills/data/sources';
import { BILLS_TABLES } from '../engine/bills/data/tables';
import { setUpTelecom } from '../bills/telecom/main';
import type { TelecomEvents } from '../bills/telecom/ports';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

// Nothing on this page is measured yet: every event the review reports is heard by no one.
const ignore = () => undefined;
const events: TelecomEvents = {
  stepShown: ignore,
  wentBack: ignore,
  stepCompleted: ignore,
  fieldRejected: ignore,
  helpOpened: ignore,
  startedOver: ignore,
  outOfScope: ignore,
  reviewCompleted: ignore,
  reviewCleared: ignore,
};

setUpTelecom(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: {
    norms: BILLS_NORMS,
    sources: BILLS_SOURCES,
    tables: { holidays: BILLS_TABLES.holidays },
  },
});
