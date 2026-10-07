import { describe, expect, it } from 'vitest';
import { noticeView, warnsOnLeave } from '../../src/documents/notice';
import type { Download } from '../../src/documents/ports';

const state = (fresh: boolean, downloaded: Download[], showing = true) => ({
  fresh,
  showing,
  downloaded: new Set(downloaded),
});

describe('the notice after paying', () => {
  it('only after a payment made in this page', () => {
    expect(noticeView(state(false, []))).toBe('hidden');
    expect(warnsOnLeave(state(false, []))).toBe(false);
  });
  it('in full until the report and the letter were each downloaded once, then one line', () => {
    expect(noticeView(state(true, []))).toBe('full');
    expect(noticeView(state(true, ['report']))).toBe('full');
    expect(noticeView(state(true, ['report', 'letter']))).toBe('done');
  });
  it('never while no review is on screen or its pass stopped being good', () => {
    expect(noticeView(state(true, [], false))).toBe('hidden');
    expect(warnsOnLeave(state(true, [], false))).toBe(false);
  });
  it('warns on leaving only before the first download', () => {
    expect(warnsOnLeave(state(true, []))).toBe(true);
    expect(warnsOnLeave(state(true, ['letter']))).toBe(false);
  });
});
