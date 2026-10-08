// What an evaluation run spends, counted from the tokens Bedrock reports, and the guard that stops
// it before a pack could take it past the cap.

export interface Price {
  // USD per million tokens.
  readonly input: number;
  readonly output: number;
}

export const costUsd = (price: Price, inputTokens: number, outputTokens: number): number =>
  (inputTokens * price.input + outputTokens * price.output) / 1_000_000;

export interface WorstCase {
  readonly models: { readonly primary: string; readonly escalation: string };
  readonly prices: Readonly<Record<string, Price>>;
  // max_tokens each model is called with for the review.
  readonly maxOutputTokens: Readonly<Record<string, number>>;
  // The most input a read the API accepts can have.
  readonly maxInputTokens: number;
}

export function priceOf(prices: WorstCase['prices'], model: string): Price {
  const price = prices[model];
  if (price === undefined) throw new Error(`No price for model ${model}`);
  return price;
}

// The most one pack can cost: a primary read at the largest input and its max_tokens, and an
// escalation read on top when the escalation model is another one.
export function worstCaseUsd({
  models,
  prices,
  maxOutputTokens,
  maxInputTokens,
}: WorstCase): number {
  const reads =
    models.escalation === models.primary ? [models.primary] : [models.primary, models.escalation];
  return reads.reduce((sum, model) => {
    const output = maxOutputTokens[model];
    if (output === undefined) throw new Error(`No max_tokens for model ${model}`);
    return sum + costUsd(priceOf(prices, model), maxInputTokens, output);
  }, 0);
}

export class SpendCounter {
  #spent = 0;

  constructor(readonly maxUsd: number) {}

  get spentUsd(): number {
    return this.#spent;
  }

  // Whether the next pack, at its worst, still fits under the cap.
  canAfford(worstUsd: number): boolean {
    return this.#spent + worstUsd <= this.maxUsd;
  }

  add(usd: number): void {
    this.#spent += usd;
  }
}
