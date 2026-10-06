import { describe, expect, it } from 'vitest';
import { asksNotToTrack } from '../../src/analytics/posthog';

describe('asksNotToTrack', () => {
  it.each([
    [{ globalPrivacyControl: true }, {}, true],
    [{ doNotTrack: '1' }, {}, true],
    [{ doNotTrack: 'yes' }, {}, true],
    [{}, { doNotTrack: '1' }, true],
    [{ globalPrivacyControl: false, doNotTrack: '0' }, {}, false],
    [{ doNotTrack: 'unspecified' }, {}, false],
    [{}, {}, false],
  ])('%o %o → %s', (nav, win, expected) => {
    expect(asksNotToTrack(nav, win)).toBe(expected);
  });
});
