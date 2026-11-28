import { describe, expect, it } from 'vitest';
import { scope, scopePhrases } from '../../../src/engine/mortgage/scope';
import { mortgage } from './input';

describe('mortgage scope', () => {
  it("takes a natural person's standard mortgage on a home", () => {
    expect(scope(mortgage())).toEqual({ inScope: true });
    expect(scopePhrases(scope(mortgage()))).toEqual([]);
  });

  it.each([[{ purpose: 'business' }, 'business_purpose']] as const)(
    'stops %j at the door and says why',
    (change, reason) => {
      const reach = scope(mortgage(change));
      expect(reach).toEqual({ inScope: false, reason });
      expect(scopePhrases(reach)).toEqual([{ key: `scope.${reason}` }]);
    },
  );
});
