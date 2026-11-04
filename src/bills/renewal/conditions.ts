export { applyConditions } from '../../calculator/review-form';

// Every sheet of a renewal letter is asked: the review has no gate.
export const applies = (): boolean => true;
