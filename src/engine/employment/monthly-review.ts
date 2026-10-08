import {
  blocksReview,
  monthlyChecklist as lawMonthlyChecklist,
  REVIEW_INTERVAL_DAYS,
  type ArticleWatch as LawArticleWatch,
  type ChecklistItem as LawChecklistItem,
  type MonthlyReviewDeps as LawMonthlyReviewDeps,
  type WatchedArticle as LawWatchedArticle,
  type WatchedMatter as LawWatchedMatter,
} from '../law/monthly-review';
import type { CivilDate } from '../date';
import type { EmploymentNormId } from './norms';

export { blocksReview, REVIEW_INTERVAL_DAYS };

// Changes announced but with no rule, because none is in the BOE yet.
export type WatchedMatterId =
  'working_week_reduction' | 'digital_time_record' | 'next_minimum_wage' | 'sepe_information_model';

export type WatchedArticle = LawWatchedArticle<EmploymentNormId>;
export type WatchedMatter = LawWatchedMatter<WatchedMatterId>;
export type ArticleWatch = LawArticleWatch<EmploymentNormId, WatchedMatterId>;
export type MonthlyReviewDeps = LawMonthlyReviewDeps<EmploymentNormId, WatchedMatterId>;
export type ChecklistItem = LawChecklistItem<EmploymentNormId, WatchedMatterId>;

export const monthlyChecklist = (
  today: CivilDate,
  deps: MonthlyReviewDeps,
): readonly ChecklistItem[] => lawMonthlyChecklist(today, deps);
