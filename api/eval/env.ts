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

export type EvalReview = 'rental' | 'employment';

export interface EvalArgs {
  readonly review: EvalReview;
  // Relative to api/.
  readonly cases: string;
}

const DEFAULT_CASES: Readonly<Record<EvalReview, string>> = {
  rental: 'eval/cases',
  employment: 'eval/cases/employment',
};

// `--review rental|employment` (rental by default) and `--cases <dir>` (that review's bank by default).
export function parseEvalArgs(argv: readonly string[]): EvalArgs {
  const valueOf = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    if (i === -1) return undefined;
    const v = argv[i + 1];
    if (v === undefined || v === '' || v.startsWith('--')) throw new Error(`${name} takes a value`);
    return v;
  };
  const review = valueOf('--review') ?? 'rental';
  if (review !== 'rental' && review !== 'employment')
    throw new Error(`--review is rental or employment, not ${review}`);
  return { review, cases: (valueOf('--cases') ?? DEFAULT_CASES[review]).replace(/\/+$/, '') };
}
