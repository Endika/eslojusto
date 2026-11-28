import { applyConditions } from '../calculator/review-form';
import { setUpSection, type SectionForm } from '../calculator/section';
import { reviewCredit, type CreditReview } from '../engine/credit/review';
import type { Scope } from '../engine/credit/types';
import { gate } from './conditions';
import { SHEETS, onQuestions, readCreditForm, sheetErrors, sheetOfField } from './form';
import type { CreditSetup } from './ports';
import { renderCreditResult, renderErrors, renderOutOfScope } from './render';
import { CREDIT_FLOW as flow } from './steps';

type OutOfScope = Extract<Scope, { inScope: false }>;

// The consumer credit review: its sheets, the gate after the first ones and the result, shown
// again when the pass is verified or dropped.
export function setUpCredit(
  root: HTMLElement,
  { events, today, tr, tables, detail }: CreditSetup,
): SectionForm {
  let shown: CreditReview | null = null;
  const locked = () => detail?.() === 'locked';
  function showOutOfScope(result: HTMLElement, reach: OutOfScope): void {
    shown = null;
    renderOutOfScope(result, reach, tr);
    events.reviewCleared();
    events.outOfScope(reach.reason);
  }
  return setUpSection(root, {
    formId: 'credit',
    flow,
    sheets: SHEETS,
    events,
    today,
    applyConditions,
    sheetOfField,
    sheetErrors,
    renderErrors: (form, errors) => renderErrors(form, errors, tr),
    stopsAtGate(form, result) {
      const g = gate(form);
      if (g.inScope) return false;
      showOutOfScope(result, g);
      return true;
    },
    review(form, result, day) {
      const parsed = readCreditForm(form, day);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewCredit(parsed.input, day, tables);
      // The form already ran the engine's checks and its gate; the two guards below only keep the
      // form and the engine from drifting apart.
      // Stryker disable next-line ConditionalExpression: the form already ran the engine's checks, so the review is never refused
      if (!r.ok) return onQuestions(r.errors, parsed.input);
      const reach = r.review.scope;
      // Stryker disable next-line ConditionalExpression,CallExpression: the gate already stopped every credit the engine puts out of scope
      if (!reach.inScope) showOutOfScope(result, reach);
      else {
        shown = r.review;
        renderCreditResult(result, r.review, locked(), tr);
        events.reviewCompleted({ review: r.review, input: parsed.input });
      }
      return [];
    },
    restarted() {
      shown = null;
      events.reviewCleared();
    },
    refreshResult(result) {
      if (shown) renderCreditResult(result, shown, locked(), tr);
    },
  });
}
