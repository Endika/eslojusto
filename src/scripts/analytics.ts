import { pageTranslator } from '../i18n/client';
import { watchErrors } from '../analytics/errors';
import { primaryLanguage, offerOtherLanguage, watchTranslation } from '../analytics/language';
import { startAnalytics, track } from '../analytics/posthog';

// Runs once per page view and writes nothing to the browser's storage.
watchErrors(window, track);
startAnalytics();
track('browser_language', { lang: primaryLanguage(navigator.languages) });
watchTranslation(document.documentElement, (lang) => track('page_translated', { lang }));
offerOtherLanguage(document, navigator.languages, pageTranslator());
