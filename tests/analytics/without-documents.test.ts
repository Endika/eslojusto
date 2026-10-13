// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';

const track = vi.fn();
vi.mock('../../src/analytics/posthog', () => ({ track }));
const { withoutDocuments } = await import('../../src/scripts/without-documents');

describe('a page whose document module fails', () => {
  it('shows the review and measures the failure as a js_error', () => {
    document.body.innerHTML = '<nav class="tabs" hidden></nav><div data-documents-start></div>';
    const form = document.createElement('form');
    form.hidden = true;
    document.body.prepend(form);
    withoutDocuments(form, new TypeError('Cannot read properties of null'));
    expect(form.hidden).toBe(false);
    expect(document.querySelector<HTMLElement>('.tabs')?.hidden).toBe(false);
    expect(document.querySelector('[data-documents-start]')).toBeNull();
    expect(track).toHaveBeenCalledWith('js_error', { kind: 'TypeError', source: 'unknown' });
  });
});
