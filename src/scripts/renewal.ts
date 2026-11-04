import { renewalAnalytics } from '../analytics/bills';
import { track } from '../analytics/posthog';
import { setUpRenewal } from '../bills/renewal/main';
import type { RenewalEvents, RenewalMethod } from '../bills/renewal/ports';
import { DOCUMENTS_BUILD } from '../documents/config';
import { BILLS_NORMS } from '../engine/bills/data/norms';
import { TOLL_HOLIDAYS } from '../engine/bills/data/holidays-20td';
import { pvpcTable } from '../engine/bills/data/pvpc-hourly';
import { BILLS_TABLES } from '../engine/bills/data/tables';
import type { OfficialDeps } from '../engine/bills/electricity-official';
import { pageTranslator } from '../i18n/client';
import { localToday } from './clock';
import { withoutDocuments } from './without-documents';

// The review's address as it arrived, before the form rewrites its fragment.
const arrival = { hash: location.hash, search: location.search };

// Read inline, as on the other reviews' pages, so a build without the API drops every document
// branch.
const documentsBuild =
  !!(
    import.meta.env.PUBLIC_API_EXTRACT_URL &&
    import.meta.env.PUBLIC_API_CHECKOUT_URL &&
    import.meta.env.PUBLIC_API_PASS_URL &&
    import.meta.env.PUBLIC_TURNSTILE_SITE_KEY
  ) && DOCUMENTS_BUILD;

// The answers are typed unless a reading of the letter filled them.
let method: RenewalMethod = 'manual';
const analytics = renewalAnalytics(
  track,
  () => performance.now(),
  () => method,
);
const events: RenewalEvents = {
  ...analytics,
  reviewCleared() {
    method = 'manual';
  },
};

// The PVPC prices are the one heavy table, so they are fetched only when a review needs them; if
// they cannot be, the review goes ahead and says it has no PVPC to compare with.
async function importOfficial(): Promise<OfficialDeps | null> {
  try {
    const { default: raw } = (await import('../engine/bills/data/pvpc-hourly.json')) as {
      default: unknown;
    };
    const table = pvpcTable(raw);
    return table === null ? null : { pvpc: table, tollHolidays: TOLL_HOLIDAYS };
  } catch {
    return null;
  }
}
let official: Promise<OfficialDeps | null> | null = null;

const renewal = setUpRenewal(document.body, {
  events,
  today: localToday,
  tr: pageTranslator(),
  tables: { tables: BILLS_TABLES, norms: BILLS_NORMS },
  official: () => (official ??= importOfficial()),
});
if (documentsBuild)
  import('./renewal-documents')
    .then(({ wireRenewalDocuments }) =>
      wireRenewalDocuments(renewal, arrival, () => (method = 'upload')),
    )
    .catch((error: unknown) => withoutDocuments(renewal.form, error));
