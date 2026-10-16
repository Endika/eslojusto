// Which review a read is for: it picks the schema, the prompt and how the documents merge.
export const REVIEWS = [
  'final_pay',
  'rental',
  'employment',
  'credit',
  'insurance',
  'mortgage',
  'electricity',
  'telecom',
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
  'electricity',
  'telecom',
] as const;
export type CheckoutReview = (typeof CHECKOUT_REVIEWS)[number];

// What a checkout may name to be sent back to; none is the final pay.
export const isReturnTo = (v: unknown): v is Exclude<CheckoutReview, 'final_pay'> =>
  v !== 'final_pay' && typeof v === 'string' && (CHECKOUT_REVIEWS as readonly string[]).includes(v);

// The languages of the site's pages, which a checkout may be sent back to; Spanish has no prefix.
export const CHECKOUT_LANGS = ['es', 'en', 'ar', 'ro', 'fr', 'uk', 'zh', 'ca', 'eu', 'gl'] as const;
export type CheckoutLang = (typeof CHECKOUT_LANGS)[number];
export const isCheckoutLang = (v: unknown): v is CheckoutLang =>
  typeof v === 'string' && (CHECKOUT_LANGS as readonly string[]).includes(v);
