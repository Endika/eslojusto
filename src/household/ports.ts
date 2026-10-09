import type { CivilDate } from '../engine/date';
import type { HouseholdDeps, HouseholdReview } from '../engine/household/review';
import type { HouseholdInput, ItemId, Scope } from '../engine/household/types';
import type { Translate } from '../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';

export type OutOfScopeReason = Extract<Scope, { inScope: false }>['reason'];

// How the relationship stands, as the dates sheet asks it.
export type HouseholdEnding = 'working' | 'desistimiento' | 'et_cause' | 'unknown';

export interface CompletedHouseholdReview {
  readonly review: HouseholdReview;
  readonly input: HouseholdInput;
  readonly ending: HouseholdEnding;
}

// The names of the questions, as a rejected answer is reported.
export const HOUSEHOLD_FIELDS = [
  'work',
  'startDate',
  'ending',
  'endDate',
  'monthlyPay',
  'hourlyRate',
  'monthlyAverage',
  'inKind',
  'extraCount',
  'extraProrated',
  'extraAmount',
  'extraAccrual',
  'weeklyHours',
  'shortestRest',
  'restMadeUp',
  'weeklyRest',
  'holidayDays',
  'holidayStretch',
  'holidayTaken',
  'cause',
  'inWriting',
  'severanceAvailable',
  'severanceOffered',
  'noticeDays',
  'substitutePaid',
  'nightNotice',
  'seriousBreach',
] as const;
export type HouseholdField = (typeof HOUSEHOLD_FIELDS)[number];

// What a result card is about, as its `data-kind` names it.
export type HouseholdItemKind = ItemId;

// What happens during a visit, for whoever listens; the review does not know who does.
export interface HouseholdEvents {
  stepShown(step: Step): void;
  stepCompleted(step: Step): void;
  wentBack(from: Step, to: Step): void;
  fieldRejected(step: Step, field: string): void;
  outOfScope(reason: OutOfScopeReason): void;
  reviewCompleted(r: CompletedHouseholdReview): void;
  // A frequently asked question, by the id of its <details>.
  helpOpened(topic: string): void;
  detailOpened(item: HouseholdItemKind): void;
  startedOver(): void;
}

export interface HouseholdPageDeps {
  readonly events: HouseholdEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms and the minimum wage table the review reads, as the composition root loads them.
  readonly tables: HouseholdDeps;
}
