// Which review a read is for: it picks the schema, the prompt and how the documents merge.
export const REVIEWS = ['final_pay', 'rental'] as const;
export type ReviewKind = (typeof REVIEWS)[number];

export const isReview = (v: unknown): v is ReviewKind =>
  typeof v === 'string' && (REVIEWS as readonly string[]).includes(v);
