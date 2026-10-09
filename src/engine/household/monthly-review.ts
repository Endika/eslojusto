import type { CivilDate } from '../date';
import {
  blocksReview,
  monthlyChecklist as lawMonthlyChecklist,
  REVIEW_INTERVAL_DAYS,
  type ArticleWatch as LawArticleWatch,
  type ChecklistItem as LawChecklistItem,
  type MonthlyReviewDeps as LawMonthlyReviewDeps,
} from '../law/monthly-review';
import type { HouseholdNormId } from './norms';

export { blocksReview, REVIEW_INTERVAL_DAYS };

// The minimum wage of the next year is the only change announced that the rules wait on.
export type WatchedMatterId = 'next_minimum_wage';

export type ArticleWatch = LawArticleWatch<HouseholdNormId, WatchedMatterId>;
export type MonthlyReviewDeps = LawMonthlyReviewDeps<HouseholdNormId, WatchedMatterId>;
export type ChecklistItem = LawChecklistItem<HouseholdNormId, WatchedMatterId>;

export const monthlyChecklist = (
  today: CivilDate,
  deps: MonthlyReviewDeps,
): readonly ChecklistItem[] => lawMonthlyChecklist(today, deps);
