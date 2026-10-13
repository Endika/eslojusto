import { pageTranslator, type ClientKey, type Translate } from '../i18n/client';

// The shared messages the bills pages word their own way: their pass has no letter yet.
const BILLS_COPY: Partial<Record<ClientKey, ClientKey>> = {
  'client.documents.pass.issued': 'client.bills.pass.issued',
};

export const billsTranslator = (): Translate => {
  const tr = pageTranslator();
  return (key, vars) => tr(BILLS_COPY[key] ?? key, vars);
};
