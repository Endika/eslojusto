import { describe, expect, it } from 'vitest';
import { parseDate as f } from '../../../src/engine/date';
import { ruleFrame } from '../../../src/engine/rental/rule-worlds';
import { NORMS_BEFORE_VOTE } from './norms-before-vote';

describe('the rule frame', () => {
  it('looks only at the rules asked for', () => {
    const frame = ruleFrame(f('2026-10-20'), ['deposit_one_month'], NORMS_BEFORE_VOTE);
    expect(frame.doubts).toEqual([]);
    expect([...frame.active.keys()]).toEqual(['deposit_one_month']);
    expect(frame.holds('deposit_one_month', {})).toBe(true);
  });
});
