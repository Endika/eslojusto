import { describe, expect, it } from 'vitest';
import { noticeView, warnsOnLeave } from '../../src/documents/notice';
import type { Download } from '../../src/documents/ports';

const state = (fresh: boolean, letter: boolean, downloaded: Download[]) => ({
  fresh,
  letter,
  downloaded: new Set(downloaded),
});

describe('the notice after paying', () => {
  it('only after a payment made in this page', () => {
    expect(noticeView(state(false, true, []))).toBe('hidden');
    expect(warnsOnLeave(state(false, true, []))).toBe(false);
  });
  it('in full until every PDF on offer was downloaded once, then one line', () => {
    expect(noticeView(state(true, true, []))).toBe('full');
    expect(noticeView(state(true, true, ['report']))).toBe('full');
    expect(noticeView(state(true, true, ['report', 'letter']))).toBe('done');
    expect(noticeView(state(true, false, ['report']))).toBe('done');
  });
  it('warns on leaving only before the first download', () => {
    expect(warnsOnLeave(state(true, true, []))).toBe(true);
    expect(warnsOnLeave(state(true, true, ['letter']))).toBe(false);
  });
});
