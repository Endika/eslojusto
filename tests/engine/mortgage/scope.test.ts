import { describe, expect, it } from 'vitest';
import { scope, scopePhrases } from '../../../src/engine/mortgage/scope';
import { mortgage } from './input';

describe('mortgage scope', () => {
  it("takes a natural person's standard mortgage on a home", () => {
    expect(scope(mortgage())).toEqual({ inScope: true });
    expect(scopePhrases(scope(mortgage()))).toEqual([]);
  });

  it.each([
    [{ borrower: 'company' }, 'company'],
    [{ purpose: 'business' }, 'business_purpose'],
    [{ loanKind: 'developer_subrogation' }, 'developer_subrogation'],
    [{ loanKind: 'multicurrency' }, 'multicurrency'],
    [{ loanKind: 'reverse' }, 'reverse'],
    [{ loanKind: 'not_mortgage' }, 'not_mortgage'],
  ] as const)('stops %j at the door and says why', (change, reason) => {
    const reach = scope(mortgage(change));
    expect(reach).toEqual({ inScope: false, reason });
    expect(scopePhrases(reach)).toEqual([{ key: `scope.${reason}` }]);
  });

  it('a company is told first, whatever else the loan is', () => {
    expect(scope(mortgage({ borrower: 'company', loanKind: 'reverse' }))).toEqual({
      inScope: false,
      reason: 'company',
    });
  });

  it('a person who does not know whether they are a consumer is still reviewed', () => {
    expect(scope(mortgage({ consumer: null }))).toEqual({ inScope: true });
  });
});
