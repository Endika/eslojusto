import type { ClientKey, Translate } from '../i18n/client';
import { SKIP_REASONS, type ReadPage, type SkipReason } from './contract';

export interface SkippedPage {
  // 1-based, in the order sent.
  readonly page: number;
  readonly reason: SkipReason;
}

// The pages of a read that gave nothing, in order, and why. In a read that found something, a
// legible page without data is just a page set aside, so only `nothing_read` lists those.
export function skippedPages(
  pages: readonly ReadPage[],
  sent: number,
  nothingRead: boolean,
): SkippedPage[] {
  const byNumber = new Map(pages.map((p) => [p.page, p]));
  const skipped: SkippedPage[] = [];
  for (let page = 1; page <= sent; page += 1) {
    const read = byNumber.get(page);
    if (!read) skipped.push({ page, reason: 'unread' });
    else if (read.readability !== 'ok') skipped.push({ page, reason: read.readability });
    else if (nothingRead) skipped.push({ page, reason: 'no_data' });
  }
  return skipped;
}

// Each reason once, in the catalogue's order: what analytics may carry.
export const reasonsOf = (skipped: readonly SkippedPage[]): SkipReason[] =>
  SKIP_REASONS.filter((r) => skipped.some((s) => s.reason === r));

// «Foto 3: sale borrosa. Prueba con más luz y el móvil quieto.», naming each page as the list of
// files does.
export function skippedLines(
  skipped: readonly SkippedPage[],
  name: (page: number) => string,
  tr: Translate,
  key:
    | 'client.documents.skipped.line'
    | 'client.documents.skipped.done' = 'client.documents.skipped.line',
): string[] {
  return skipped.map((s) =>
    tr(key, {
      nombre: name(s.page),
      motivo: tr(`client.documents.skipped.${s.reason}` as ClientKey),
    }),
  );
}
