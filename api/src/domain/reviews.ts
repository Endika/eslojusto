// Which review a read is for: it picks the schema, the prompt and how the documents merge.
export const REVIEWS = [
  'final_pay',
  'rental',
  'employment',
  'credit',
  'insurance',
  'mortgage',
] as const;
export type ReviewKind = (typeof REVIEWS)[number];

export const isReview = (v: unknown): v is ReviewKind =>
  typeof v === 'string' && (REVIEWS as readonly string[]).includes(v);

// The reviews a pass can be bought from: the insurance review has no figure for one to unlock.
export const CHECKOUT_REVIEWS = [
  'final_pay',
  'rental',
  'employment',
  'credit',
  'mortgage',
] as const;
export type CheckoutReview = (typeof CHECKOUT_REVIEWS)[number];

// What a checkout may name to be sent back to; none is the final pay.
export const isReturnTo = (v: unknown): v is Exclude<CheckoutReview, 'final_pay'> =>
  v !== 'final_pay' && typeof v === 'string' && (CHECKOUT_REVIEWS as readonly string[]).includes(v);
