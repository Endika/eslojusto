import type { Review } from '../engine/review';
import type { Translate } from '../i18n/client';
import type { RevealArm } from './ports';

// Every line of the sequence names something the review did check: only the pace is staged.
export const pickArm = (random: number, reducedMotion: boolean): RevealArm =>
  reducedMotion ? 'reduced' : random < 0.5 ? 'staged' : 'instant';

export interface RevealSteps {
  readonly lines: readonly string[];
  readonly summary: string;
}

// One line per item the review worked out against the law, and how many items and legal references
// that took. An item left without a figure (a «No lo sé», the agreement) was not checked: it is not
// listed or counted.
export function revealSteps(review: Review, tr: Translate): RevealSteps {
  const items = review.items.map((r) => r.item).filter((i) => i.range !== null);
  const references = new Set(items.flatMap((i) => i.sources.map((s) => s.citation)));
  return {
    lines: items.map((i) => tr('client.reveal.checked', { partida: tr(`client.item.${i.id}`) })),
    summary: tr('client.reveal.summary', {
      partidas: String(items.length),
      referencias: String(references.size),
    }),
  };
}

// The whole sequence lasts this long the first time; a later review in the same visit, less.
const FIRST_MS = 2400;
const AGAIN_MS = 800;

// Shows the steps one by one inside the result, with the rest of it hidden, then the result.
// Returns a function that ends it at once, for a new review, a restart or going back.
export function stageReveal(
  result: HTMLElement,
  steps: RevealSteps,
  again: boolean,
  done: () => void = () => {},
): () => void {
  const panel = result.querySelector<HTMLElement>('[data-reveal]');
  const list = result.querySelector<HTMLElement>('[data-reveal-steps]');
  const summary = result.querySelector<HTMLElement>('[data-reveal-summary]');
  if (!panel || !list || !summary) {
    done();
    return () => {};
  }
  const timers: number[] = [];
  const finish = () => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    result.removeAttribute('data-revealing');
    panel.hidden = true;
  };
  list.replaceChildren();
  summary.textContent = '';
  panel.hidden = false;
  result.setAttribute('data-revealing', '');
  const pace = (again ? AGAIN_MS : FIRST_MS) / (steps.lines.length + 2);
  steps.lines.forEach((line, i) => {
    timers.push(
      window.setTimeout(() => {
        const li = document.createElement('li');
        li.textContent = line;
        list.append(li);
      }, pace * i),
    );
  });
  timers.push(
    window.setTimeout(() => {
      summary.textContent = steps.summary;
    }, pace * steps.lines.length),
  );
  timers.push(
    window.setTimeout(
      () => {
        finish();
        done();
      },
      pace * (steps.lines.length + 2),
    ),
  );
  return finish;
}
