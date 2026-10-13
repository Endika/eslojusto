import { errorProps } from '../analytics/errors';
import { track } from '../analytics/posthog';

// Without the document module the page is still the review. The failure may come from wiring the
// module, not only from loading it, so it is measured like any other script error.
export function withoutDocuments(form: HTMLElement, error: unknown): void {
  track('js_error', errorProps(error));
  form.hidden = false;
  const tabs = document.querySelector<HTMLElement>('.tabs');
  if (tabs) tabs.hidden = false;
  document.querySelector<HTMLElement>('[data-documents-start]')?.remove();
}
