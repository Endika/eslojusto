import { pageTranslator, papersTranslator, type ClientKey, type Translate } from '../i18n/client';

// The shared messages the bills pages word their own way: their pass does not always come with a
// letter.
const BILLS_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.pass.issued': 'client.bills.pass.issued',
};

const billsCopy =
  (tr: Translate): Translate =>
  (key, vars) =>
    tr(BILLS_COPY[key] ?? key, vars);

export const billsTranslator = (): Translate => billsCopy(pageTranslator());

// The same, in Spanish, for the report and the letters.
export const billsPapersTranslator = (): Translate => billsCopy(papersTranslator());
