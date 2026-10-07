import { describe, expect, it } from 'vitest';
import { SKIP_REASONS } from '../../src/documents/contract';
import { reasonsOf, skippedLines, skippedPages } from '../../src/documents/skipped';
import { t } from '../../src/i18n';
import { tr } from './fixtures';

describe('skipped pages', () => {
  const pages = [
    { page: 1, kind: 'payslip', readability: 'ok' },
    { page: 3, kind: 'other', readability: 'cropped' },
    { page: 4, kind: 'other', readability: 'ok' },
  ] as const;

  it('in a read that found something, lists only the pages set aside or left out', () => {
    expect(skippedPages(pages, 4, false)).toEqual([
      { page: 2, reason: 'unread' },
      { page: 3, reason: 'cropped' },
    ]);
  });

  it('in a read that found nothing, says of a legible page that it had nothing to use', () => {
    expect(skippedPages(pages, 4, true)).toEqual([
      { page: 1, reason: 'no_data' },
      { page: 2, reason: 'unread' },
      { page: 3, reason: 'cropped' },
      { page: 4, reason: 'no_data' },
    ]);
  });

  it('gives each reason once, in a fixed order', () => {
    expect(reasonsOf(skippedPages(pages, 4, true))).toEqual(['cropped', 'no_data', 'unread']);
  });

  it('names each page as the list of files does', () => {
    const names = ['Foto 1', 'contrato.pdf, página 2'];
    expect(skippedLines([{ page: 2, reason: 'dark' }], (n) => names[n - 1] ?? '', tr)).toEqual([
      'contrato.pdf, página 2: sale muy oscura. Prueba con más luz.',
    ]);
  });

  it('has words for every reason', () => {
    for (const reason of SKIP_REASONS)
      expect(t('es', `client.documents.skipped.${reason}`)).not.toContain('client.');
  });
});
