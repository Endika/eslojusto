import { estimateBenefit } from '../engine/unemployment';
import { reviewFinalPay } from '../engine/review';
import { applyConditions, followHolidayDefault } from './conditions';
import { required } from './dom';
import { rowsNeeded } from './fill';
import {
  SHEETS,
  baseField,
  sheetErrors,
  sheetOfField,
  readBenefitSheets,
  readForm,
  readSituations,
} from './form';
import { setUpOtherContracts } from './other-contracts';
import type { ItemId } from '../engine/types';
import type { CalculatorDeps, CompletedReview } from './ports';
import { renderErrors, renderResult, type ResultData } from './render';
import { setUpSection, type SectionForm } from './section';
import { FINAL_PAY_FLOW } from './steps';

// The final pay's review: its sheets and the result, shown again when its detail is locked or
// unlocked. A page about one cause opens on the sheet after it.
export function setUpCalculator(
  root: HTMLElement,
  { events, today, tr, detail = () => 'unlocked', flow = FINAL_PAY_FLOW }: CalculatorDeps,
): SectionForm {
  const form = required(root.querySelector<HTMLFormElement>('#calculator'), 'the form');
  const otherContracts = setUpOtherContracts(form, tr, () => applyConditions(form));
  // The last review shown, to show it again when its detail is unlocked or locked.
  let shown: ResultData | null = null;
  let completed: CompletedReview | null = null;

  return setUpSection(root, {
    formId: 'calculator',
    flow,
    sheets: SHEETS,
    events,
    today,
    applyConditions,
    changed: followHolidayDefault,
    sheetOfField,
    fieldName: baseField,
    sheetErrors,
    renderErrors: (f, errors) => renderErrors(f, errors, tr),
    stopsAtGate: () => false,
    review(f, result, day) {
      const parsed = readForm(f);
      if ('errors' in parsed) return parsed.errors;
      const r = reviewFinalPay(parsed.input, parsed.figures, day);
      if (!r.ok) return r.errors;
      const benefit = readBenefitSheets(f);
      if ('errors' in benefit) return benefit.errors;
      const estimate = estimateBenefit(
        parsed.input,
        benefit.data?.children ?? null,
        benefit.data?.others,
      );
      shown = {
        review: r.review,
        benefit: estimate,
        cause: parsed.input.cause,
        children: benefit.data?.children ?? null,
        erte: parsed.input.erte,
        // Kept to the result: the events below never get them.
        situations: readSituations(f),
      };
      const state = detail();
      renderResult(result, shown, state === 'locked', tr);
      completed = {
        review: r.review,
        input: parsed.input,
        figures: parsed.figures,
        benefit: estimate,
        otherContracts: benefit.data?.others.contracts.length ?? 0,
        detail: state,
      };
      return [];
    },
    reviewed() {
      if (completed) events.reviewCompleted(completed);
    },
    opened(d) {
      const item = d.closest<HTMLElement>('[data-item]')?.dataset['item'];
      if (d.hasAttribute('data-detail') && item) events.detailOpened(item as ItemId);
    },
    restarted() {
      shown = null;
      otherContracts.reset();
    },
    beforeFill(entries) {
      const rows = rowsNeeded(entries);
      if (rows > 0) otherContracts.setRows(rows);
    },
    filled: (f) => renderErrors(f, [], tr),
    refreshResult(result) {
      if (shown) renderResult(result, shown, detail() === 'locked', tr);
    },
  });
}
