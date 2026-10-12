import type { BenefitEstimate } from './unemployment';

// Whether the benefit sheet shows amounts; never the children, the dates or the amounts.
export const BENEFIT_STATES = ['not_applicable', 'with_figures', 'no_figures'] as const;
export type BenefitState = (typeof BENEFIT_STATES)[number];

export const benefitState = (p: BenefitEstimate): BenefitState =>
  p.entitled === 'no' ? 'not_applicable' : p.figures === null ? 'no_figures' : 'with_figures';
