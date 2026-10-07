import type { Download } from './ports';

// The notice after a payment made in this page: download now, nothing is kept anywhere else.
export interface NoticeState {
  // A pass issued on the way back from Stripe, in this page's life.
  readonly fresh: boolean;
  // A review on screen and its pass still good: the notice has something to download.
  readonly showing: boolean;
  // Whether the review offers the letter, as well as the report.
  readonly letter: boolean;
  readonly downloaded: ReadonlySet<Download>;
}

export type NoticeView = 'hidden' | 'full' | 'done';

export function noticeView(s: NoticeState): NoticeView {
  if (!s.fresh || !s.showing) return 'hidden';
  const wanted: readonly Download[] = s.letter ? ['report', 'letter'] : ['report'];
  return wanted.every((d) => s.downloaded.has(d)) ? 'done' : 'full';
}

// Leaving is warned of only while the notice is up, right after paying, before any PDF was saved.
export const warnsOnLeave = (s: NoticeState): boolean =>
  noticeView(s) === 'full' && s.downloaded.size === 0;
