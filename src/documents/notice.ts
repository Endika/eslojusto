import type { Download } from './ports';

// The notice after a payment made in this page: download now, nothing is kept anywhere else.
export interface NoticeState {
  // A pass issued on the way back from Stripe, in this page's life.
  readonly fresh: boolean;
  // Whether the review offers the letter, as well as the report.
  readonly letter: boolean;
  readonly downloaded: ReadonlySet<Download>;
}

export type NoticeView = 'hidden' | 'full' | 'done';

export function noticeView(s: NoticeState): NoticeView {
  if (!s.fresh) return 'hidden';
  const wanted: readonly Download[] = s.letter ? ['report', 'letter'] : ['report'];
  return wanted.every((d) => s.downloaded.has(d)) ? 'done' : 'full';
}

// Leaving is warned of only right after paying, before any PDF was saved.
export const warnsOnLeave = (s: NoticeState): boolean => s.fresh && s.downloaded.size === 0;
