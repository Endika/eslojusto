import { parseDate } from '../../../src/engine/date';
import type { InsuranceInput, RenewalNotice } from '../../../src/engine/insurance/types';

// A synthetic home policy that extends itself every year; tests override what they check.
export const policy = (change: Partial<InsuranceInput> = {}): InsuranceInput => ({
  line: 'home',
  carCover: null,
  mortgageRequired: false,
  renews: true,
  expiresOn: parseDate('2027-03-01'),
  notice: null,
  distance: false,
  concludedOn: parseDate('2024-03-01'),
  policyReceived: true,
  policyReceivedOn: null,
  ...change,
});

export const notice = (change: Partial<RenewalNotice> = {}): RenewalNotice => ({
  receivedOn: parseDate('2026-10-01'),
  previousPremium: 300,
  newPremium: 345,
  changes: false,
  ...change,
});

export const TODAY = parseDate('2026-10-09');
