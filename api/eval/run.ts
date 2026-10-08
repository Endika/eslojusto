// Composition root of an evaluation run over a synthetic bank: the real Bedrock reader, the
// Lambda's own domain, a spending cap. Outside vitest and CI; see api/README.md, «Evaluation».
//   EVAL_CONFIRM=yes EVAL_MAX_USD=3 npm run eval [-- --review employment --cases eval/cases/employment --only id1,id2]
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ESCALATION_MODEL,
  MODEL_PRICES_USD_PER_MTOK,
  MODEL_SETTINGS,
  PRIMARY_MODEL,
} from '../src/config';
import { EXTRA_OUTPUT_TOKENS_BY_REVIEW, MAX_ESTIMATED_INPUT_TOKENS } from '../src/domain/tokens';
import { parseEvalArgs, parseEvalEnv, selectCases, type EvalArgs } from './env';
import {
  employmentBank,
  evaluate,
  rentalBank,
  type EvalBank,
  type EvalCase,
  type EvalDeps,
  type EvalPack,
  type EvalReport,
} from './evaluate';
import { SHEET } from './schema';

const env = parseEvalEnv(process.env);
if (!env.ok) {
  console.error(env.message);
  process.exit(1);
}
let args: EvalArgs;
try {
  args = parseEvalArgs(process.argv.slice(2));
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}

// The adapters load only past the confirmation, so nothing reaches AWS without it.
const { bedrockInvoke, createBedrockReader } = await import('../src/adapters/bedrock-reader');
const { createHmacSigner } = await import('../src/adapters/hmac-signer');
const { systemClock } = await import('../src/adapters/runtime');

const EVAL = new URL('./', import.meta.url);
const API = new URL('../', EVAL);
// Each bank renders to its own folder, where the report goes too.
const OUT = new URL(args.review === 'rental' ? 'out/' : 'out/employment/', EVAL);
const RENDER = args.review === 'rental' ? 'rental-bank' : 'employment-bank';

const sheetsOf = (template: string): number =>
  readFileSync(new URL(`templates/${template}.html`, EVAL), 'utf8').match(SHEET)?.length ?? 0;

function packsOf<C extends EvalCase & { readonly eval: boolean }>(
  bank: EvalBank<C>,
): readonly EvalPack<C>[] {
  const dir = new URL(`${args.cases}/`, API);
  const cases = readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => JSON.parse(readFileSync(new URL(name, dir), 'utf8')) as C);
  return selectCases(cases, args.only ?? process.env['EVAL_CASES']).map((bankCase) => {
    const images = new URL(`${bankCase.id}/`, OUT);
    const names = existsSync(images)
      ? readdirSync(images)
          .filter((n) => n.endsWith('.jpg'))
          .sort()
      : [];
    const want = bank.pagesOf(bankCase).length;
    if (names.length !== want)
      throw new Error(
        `${bankCase.id}: ${names.length} images rendered, ${want} expected; run «npm run ${RENDER}» at the root first`,
      );
    return {
      bankCase,
      files: names.map((n) => ({
        mediaType: 'image/jpeg' as const,
        bytes: new Uint8Array(readFileSync(new URL(n, images))),
      })),
    };
  });
}

// The packs load, and their images are checked, before any AWS client is created.
function prepared<C extends EvalCase & { readonly eval: boolean }>(
  bank: EvalBank<C>,
): (deps: EvalDeps) => Promise<EvalReport> {
  const packs = packsOf(bank);
  return (deps) => evaluate(packs, bank, deps);
}
const run =
  args.review === 'rental' ? prepared(rentalBank(sheetsOf)) : prepared(employmentBank(sheetsOf));

// The reader port drops the stop reason, so the raw answer is looked at on its way.
let truncated = 0;
const invoke = bedrockInvoke();
const reader = createBedrockReader(async (modelId, body, signal) => {
  const raw = await invoke(modelId, body, signal);
  try {
    if ((JSON.parse(raw) as { stop_reason?: unknown }).stop_reason === 'max_tokens') truncated += 1;
  } catch {
    // An unparseable answer is the reader's to reject.
  }
  return raw;
});

const models = { primary: PRIMARY_MODEL, escalation: ESCALATION_MODEL };
const maxOutputTokens = Object.fromEntries(
  [...new Set([PRIMARY_MODEL, ESCALATION_MODEL])].map((m) => [
    m,
    (MODEL_SETTINGS[m]?.maxTokens ?? NaN) + EXTRA_OUTPUT_TOKENS_BY_REVIEW[args.review],
  ]),
);

const report = await run({
  reader,
  signer: createHmacSigner(randomBytes(32).toString('hex')),
  clock: systemClock,
  models,
  prices: MODEL_PRICES_USD_PER_MTOK,
  maxOutputTokens,
  maxInputTokens: MAX_ESTIMATED_INPUT_TOKENS,
  maxUsd: env.maxUsd,
  truncatedReads: () => truncated,
  progress: (line) => console.log(line),
});

const reportFile = new URL('report.json', OUT);
writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `${report.read}/${report.packs} packs read, ${report.costUsd.toFixed(4)} USD; persons transcribed: ${report.personsTranscribed}; report in ${reportFile.pathname.slice(API.pathname.length)}`,
);
