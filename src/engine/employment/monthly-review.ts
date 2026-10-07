import { ordinal, parseDate, type CivilDate } from '../date';
import { minimumWageFor, type MinimumWageTable } from './minimum-wage';
import type { EmploymentNormId, NormReview, NormTable } from './norms';

// An article whose consolidated wording is checked every month against the BOE open data API.
export interface WatchedArticle {
  readonly norm: EmploymentNormId;
  readonly block: string;
  readonly apiUrl: string;
  // `fecha_vigencia` of the wording the rules rest on, and the BOE id of the norm that gave it.
  readonly versionInForceSince: string;
  readonly lastAmendedBy: string;
}

// Changes announced but with no rule, because none is in the BOE yet.
export type WatchedMatterId =
  'working_week_reduction' | 'digital_time_record' | 'next_minimum_wage' | 'sepe_information_model';

export interface WatchedMatter {
  readonly id: WatchedMatterId;
  readonly url: string;
}

export interface ArticleWatch {
  readonly articles: readonly WatchedArticle[];
  readonly matters: readonly WatchedMatter[];
}

export interface MonthlyReviewDeps {
  readonly norms: NormTable;
  readonly review: NormReview;
  readonly watch: ArticleWatch;
  readonly minimumWage: MinimumWageTable;
}

export type ChecklistItem =
  | {
      readonly kind: 'norm_review_due';
      readonly norm: EmploymentNormId;
      readonly reviewedOn: string;
      readonly url: string;
    }
  | { readonly kind: 'minimum_wage_missing'; readonly year: number }
  | ({ readonly kind: 'article' } & WatchedArticle)
  | ({ readonly kind: 'matter' } & WatchedMatter);

// A monthly review, with a few days of slack so a review late in the month is not flagged early.
export const REVIEW_INTERVAL_DAYS = 35;

export function monthlyChecklist(
  today: CivilDate,
  deps: MonthlyReviewDeps,
): readonly ChecklistItem[] {
  const due: ChecklistItem[] = [];
  for (const norm of Object.values(deps.norms)) {
    const reviewedOn = deps.review[norm.id];
    if (ordinal(today) - ordinal(parseDate(reviewedOn)) > REVIEW_INTERVAL_DAYS)
      due.push({ kind: 'norm_review_due', norm: norm.id, reviewedOn, url: norm.url });
  }
  const wage: readonly ChecklistItem[] =
    minimumWageFor(today.y, deps.minimumWage).kind === 'published'
      ? []
      : [{ kind: 'minimum_wage_missing', year: today.y }];
  return [
    ...due,
    ...wage,
    ...deps.watch.articles.map((a): ChecklistItem => ({ kind: 'article', ...a })),
    ...deps.watch.matters.map((m): ChecklistItem => ({ kind: 'matter', ...m })),
  ];
}

// What must be done before the review can close: norms not read lately and a missing decree.
export const blocksReview = (item: ChecklistItem): boolean =>
  item.kind === 'norm_review_due' || item.kind === 'minimum_wage_missing';
