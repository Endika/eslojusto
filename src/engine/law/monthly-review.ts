import { ordinal, parseDate, type CivilDate } from '../date';
import { minimumWageFor, type MinimumWageTable } from './minimum-wage';
import type { NormReview, NormTable } from './norms';

// An article whose consolidated wording is checked every month against the BOE open data API.
export interface WatchedArticle<NormId extends string> {
  readonly norm: NormId;
  readonly block: string;
  readonly apiUrl: string;
  // `fecha_vigencia` of the wording the rules rest on, and the BOE id of the norm that gave it.
  readonly versionInForceSince: string;
  readonly lastAmendedBy: string;
}

// Changes announced but with no rule, because none is in the BOE yet.
export interface WatchedMatter<MatterId extends string> {
  readonly id: MatterId;
  readonly url: string;
}

export interface ArticleWatch<NormId extends string, MatterId extends string> {
  readonly articles: readonly WatchedArticle<NormId>[];
  readonly matters: readonly WatchedMatter<MatterId>[];
}

export interface MonthlyReviewDeps<NormId extends string, MatterId extends string> {
  readonly norms: NormTable<NormId>;
  readonly review: NormReview<NormId>;
  readonly watch: ArticleWatch<NormId, MatterId>;
  readonly minimumWage: MinimumWageTable;
}

export type ChecklistItem<NormId extends string, MatterId extends string> =
  | {
      readonly kind: 'norm_review_due';
      readonly norm: NormId;
      readonly reviewedOn: string;
      readonly url: string;
    }
  | { readonly kind: 'minimum_wage_missing'; readonly year: number }
  | ({ readonly kind: 'article' } & WatchedArticle<NormId>)
  | ({ readonly kind: 'matter' } & WatchedMatter<MatterId>);

// A monthly review, with a few days of slack so a review late in the month is not flagged early.
export const REVIEW_INTERVAL_DAYS = 35;

export function monthlyChecklist<NormId extends string, MatterId extends string>(
  today: CivilDate,
  deps: MonthlyReviewDeps<NormId, MatterId>,
): readonly ChecklistItem<NormId, MatterId>[] {
  const due: ChecklistItem<NormId, MatterId>[] = [];
  for (const norm of Object.values<NormTable<NormId>[NormId]>(deps.norms)) {
    const reviewedOn = deps.review[norm.id];
    if (ordinal(today) - ordinal(parseDate(reviewedOn)) > REVIEW_INTERVAL_DAYS)
      due.push({ kind: 'norm_review_due', norm: norm.id, reviewedOn, url: norm.url });
  }
  const wage: readonly ChecklistItem<NormId, MatterId>[] =
    minimumWageFor(today.y, deps.minimumWage).kind === 'published'
      ? []
      : [{ kind: 'minimum_wage_missing', year: today.y }];
  return [
    ...due,
    ...wage,
    ...deps.watch.articles.map((a): ChecklistItem<NormId, MatterId> => ({ kind: 'article', ...a })),
    ...deps.watch.matters.map((m): ChecklistItem<NormId, MatterId> => ({ kind: 'matter', ...m })),
  ];
}

// What must be done before the review can close: norms not read lately and a missing decree.
export const blocksReview = (item: { readonly kind: string }): boolean =>
  item.kind === 'norm_review_due' || item.kind === 'minimum_wage_missing';
