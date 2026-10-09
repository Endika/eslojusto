// An evaluation run spends real money on Bedrock: it starts only when told to, with a cap.
export type EvalEnv =
  { readonly ok: true; readonly maxUsd: number } | { readonly ok: false; readonly message: string };

export function parseEvalEnv(env: Readonly<Record<string, string | undefined>>): EvalEnv {
  if (env['EVAL_CONFIRM'] !== 'yes')
    return {
      ok: false,
      message: 'EVAL_CONFIRM=yes is required: this run calls Bedrock and costs money.',
    };
  const raw = env['EVAL_MAX_USD'];
  const maxUsd = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isFinite(maxUsd) || maxUsd <= 0)
    return { ok: false, message: 'EVAL_MAX_USD must be a positive number of US dollars.' };
  return { ok: true, maxUsd };
}

// EVAL_CASES picks the packs: unset, the ones marked for the AI pass; `all`; or ids, comma-separated.
export function selectCases<C extends { readonly id: string; readonly eval: boolean }>(
  cases: readonly C[],
  spec: string | undefined,
): readonly C[] {
  if (spec === undefined || spec.trim() === '') return cases.filter((c) => c.eval);
  if (spec.trim() === 'all') return cases;
  const ids = spec.split(',').map((s) => s.trim());
  const unknown = ids.filter((id) => !cases.some((c) => c.id === id));
  if (unknown.length > 0) throw new Error(`No such case: ${unknown.join(', ')}`);
  return cases.filter((c) => ids.includes(c.id));
}

export const EVAL_REVIEWS = ['rental', 'employment', 'credit', 'insurance'] as const;
export type EvalReview = (typeof EVAL_REVIEWS)[number];

const isEvalReview = (v: string): v is EvalReview =>
  (EVAL_REVIEWS as readonly string[]).includes(v);

export interface EvalArgs {
  readonly review: EvalReview;
  // Relative to api/.
  readonly cases: string;
  // `--only`: the ids of the packs to read, as EVAL_CASES takes them.
  readonly only?: string;
}

const DEFAULT_CASES: Readonly<Record<EvalReview, string>> = {
  rental: 'eval/cases',
  employment: 'eval/cases/employment',
  credit: 'eval/cases/credit',
  insurance: 'eval/cases/insurance',
};

// `--review rental|employment|credit|insurance` (rental by default), `--cases <dir>` (that review's
// bank by default) and `--only id1,id2`.
export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  const valueOf = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v === '' || v.startsWith('--')) throw new Error(`${name} takes a value`);
    return v;
  };
  const review = valueOf('--review') ?? 'rental';
  if (!isEvalReview(review))
    throw new Error(`--review is rental, employment, credit or insurance, not ${review}`);
  const cases = (valueOf('--cases') ?? DEFAULT_CASES[review]).replace(/\/+$/, '');
  const only = valueOf('--only');
  return { review, cases, ...(only !== undefined && { only }) };
}
