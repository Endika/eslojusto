import { BILLS_NORMS } from '../engine/bills/data/norms';
import { BILLS_TABLES } from '../engine/bills/data/tables';
import { setUpElectricity } from '../bills/electricity/main';
import type { ElectricityEvents } from '../bills/electricity/ports';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';

// Nothing on this page is measured yet: every event the review reports is heard by no one.
const ignore = () => undefined;
const events: ElectricityEvents = {
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

setUpElectricity(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: { norms: BILLS_NORMS, tables: BILLS_TABLES },
});
