import type { SectionEvents } from '../../calculator/section';
import type { CivilDate } from '../../engine/date';
import type { TelecomDeps, TelecomReview } from '../../engine/bills/telecom-review';
import type { TelecomInput, TelecomOutOfScope } from '../../engine/bills/types';
import type { Translate } from '../../i18n/client';
import type { Step } from './steps';

export type { Step } from './steps';
export type { TelecomOutOfScope } from '../../engine/bills/types';

// The names of the questions, as a rejected answer is reported.
export const TELECOM_FIELDS = [
  'hasCommitment',
  'startedOn',
  'months',
  'agreedPenalty',
  'exitRequestedOn',
  'change',
  'sentOn',
  'appliesOn',
  'changeKind',
  'priceIndex',
  'hasHandset',
  'handsetValue',
  'handsetKept',
  'penaltyCharged',
  'chargedAfter',
  'lineFrom',
  'lineTo',
  'lineAmount',
] as const;
export type TelecomFormField = (typeof TELECOM_FIELDS)[number];

export interface CompletedTelecomReview {
  readonly review: TelecomReview;
  readonly input: TelecomInput;
}

// What happens during a visit, for whoever listens; the review does not know who does.
export interface TelecomEvents extends SectionEvents<Step> {
  outOfScope(reason: TelecomOutOfScope): void;
  // A review shown in the result, with the answers it was worked out from.
  reviewCompleted(r: CompletedTelecomReview): void;
  // The result shows no review any more: the answers fell outside it or the person started over.
  reviewCleared(): void;
}

export interface TelecomSetup {
  readonly events: TelecomEvents;
  readonly today: () => CivilDate;
  readonly tr: Translate;
  // The norms, sources and holidays the review reads, as the composition root loads them.
  readonly tables: TelecomDeps;
}
