import { describe, expect, it } from 'vitest';
import { pideNoRastrear } from '../../src/medicion/posthog';

describe('pideNoRastrear', () => {
  it.each([
    [{ globalPrivacyControl: true }, {}, true],
    [{ doNotTrack: '1' }, {}, true],
    [{ doNotTrack: 'yes' }, {}, true],
    [{}, { doNotTrack: '1' }, true],
    [{ globalPrivacyControl: false, doNotTrack: '0' }, {}, false],
    [{ doNotTrack: 'unspecified' }, {}, false],
    [{}, {}, false],
  ])('%o %o → %s', (nav, win, esperado) => {
    expect(pideNoRastrear(nav, win)).toBe(esperado);
  });
});
