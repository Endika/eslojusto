import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { LEGAL_QUOTES } from '../../src/i18n/legal-quotes';
import { LAW_SECTIONS } from '../engine/law/registry';

const filesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesUnder(p) : [p];
  });

const sources = Object.fromEntries(LAW_SECTIONS.flatMap((s) => Object.entries(s.sources)));
const files = filesUnder('src').map((file) => [file, readFileSync(file, 'utf8')] as const);

describe('legal quotes', () => {
  it('reach a page only through <LegalQuote>', () => {
    const importers = files
      .filter(([, text]) => /from ['"][./]+(i18n\/)?legal-quotes['"]/.test(text))
      .map(([file]) => file);
    expect(importers).toEqual(['src/components/LegalQuote.astro']);
  });

  it.each(Object.entries(LEGAL_QUOTES))(
    '%s is a passage read in its verified source',
    (key, quote) => {
      const source = sources[quote.source];
      expect(source, `${key}: unknown source ${quote.source}`).toBeDefined();
      expect(source?.verified, `${key}: ${quote.source} is not verified`).toBe(true);
      expect(source?.quotes).toContain(quote.text);
    },
  );

  it.each(Object.keys(LEGAL_QUOTES))('%s is shown on some page', (key) => {
    const used = files.some(
      ([file, text]) => file.endsWith('.astro') && text.includes(`quote="${key}"`),
    );
    expect(used, key).toBe(true);
  });
});
