import { describe, expect, it } from 'vitest';
import { soleStatus } from '../../src/analytics/status';

describe('the status every reading of a point gives', () => {
  it('is the one they all give', () => {
    expect(soleStatus(new Set(['owed']))).toBe('owed');
  });

  it('is «readings» when they differ, and when there are none', () => {
    expect(soleStatus(new Set(['owed', 'matches']))).toBe('readings');
    expect(soleStatus(new Set<string>())).toBe('readings');
  });
});
