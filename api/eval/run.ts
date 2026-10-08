// Composition root of an evaluation run over the synthetic bank: the real Bedrock reader, the
// Lambda's own domain, a spending cap. Outside vitest and CI; see api/README.md, «Evaluation».
//   EVAL_CONFIRM=yes EVAL_MAX_USD=3 npm run eval
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ESCALATION_MODEL,
  MODEL_PRICES_USD_PER_MTOK,
  MODEL_SETTINGS,
  PRIMARY_MODEL,
} from '../src/config';
import { EXTRA_OUTPUT_TOKENS_BY_REVIEW, MAX_ESTIMATED_INPUT_TOKENS } from '../src/domain/tokens';
import { parseEvalEnv, selectCases } from './env';
import { evaluate, expectedPages } from './evaluate';
import { SHEET, type BankCase, type TemplateId } from './schema';

const env = parseEvalEnv(process.env);
if (!env.ok) {
  console.error(env.message);
  process.exit(1);
}

// The adapters load only past the confirmation, so nothing reaches AWS without it.
const { bedrockInvoke, createBedrockReader } = await import('../src/adapters/bedrock-reader');
const { createHmacSigner } = await import('../src/adapters/hmac-signer');
const { systemClock } = await import('../src/adapters/runtime');

const EVAL = new URL('./', import.meta.url);
const OUT = new URL('out/', EVAL);

const cases: BankCase[] = readdirSync(new URL('cases/', EVAL))
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(`cases/${name}`, EVAL), 'utf8')) as BankCase);
const sheetsOf = (template: TemplateId): number =>
  readFileSync(new URL(`templates/${template}.html`, EVAL), 'utf8').match(SHEET)?.length ?? 0;

const packs = selectCases(cases, process.env['EVAL_CASES']).map((bankCase) => {
  const dir = new URL(`${bankCase.id}/`, OUT);
  const names = existsSync(dir)
    ? readdirSync(dir)
        .filter((n) => n.endsWith('.jpg'))
        .sort()
    : [];
  const want = expectedPages(bankCase, sheetsOf).length;
  if (names.length !== want)
    throw new Error(
      `${bankCase.id}: ${names.length} images rendered, ${want} expected; run «npm run rental-bank» at the root first`,
    );
  return {
    bankCase,
    files: names.map((n) => ({
      mediaType: 'image/jpeg' as const,
      bytes: new Uint8Array(readFileSync(new URL(n, dir))),
    })),
  };
});

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
    (MODEL_SETTINGS[m]?.maxTokens ?? NaN) + EXTRA_OUTPUT_TOKENS_BY_REVIEW.rental,
  ]),
);

const report = await evaluate(packs, sheetsOf, {
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

writeFileSync(new URL('report.json', OUT), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `${report.read}/${report.packs} packs read, ${report.costUsd.toFixed(4)} USD; persons transcribed: ${report.personsTranscribed}; report in eval/out/report.json`,
);
