import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { MODEL_SETTINGS, REGION } from '../config';
import type { DocumentFile } from '../domain/documents';
import { TOOL_NAME, toolInputSchema } from '../domain/extraction-schema';
import type { Correction, DocumentReader, ModelRead } from '../domain/ports';
import type { ReviewKind } from '../domain/reviews';
import { EXTRA_OUTPUT_TOKENS_BY_REVIEW } from '../domain/tokens';
import { SYSTEM_PROMPTS } from './prompts';

export { CREDIT_SYSTEM_PROMPT } from './prompts/credit';
export { EMPLOYMENT_SYSTEM_PROMPT } from './prompts/employment';
export { SYSTEM_PROMPT } from './prompts/final-pay';
export { INSURANCE_SYSTEM_PROMPT } from './prompts/insurance';
export { MORTGAGE_SYSTEM_PROMPT } from './prompts/mortgage';
export { RENTAL_SYSTEM_PROMPT } from './prompts/rental';
export { SYSTEM_PROMPTS };

const base64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64');

const imageBlock = (file: DocumentFile): Record<string, unknown> => ({
  type: 'image',
  source: { type: 'base64', media_type: file.mediaType, data: base64(file.bytes) },
});

// What the model is told when parts of its tool input had the wrong JSON type. Schema names
// only, so nothing a document said comes back into the request.
export const correctionMessage = (malformed: readonly string[]): string =>
  `The tool input was rejected: ${malformed
    .map((part) => `${part} must be ${part === 'pages' ? 'an array' : 'a JSON object'}`)
    .join('; ')}, never a string. Call ${TOOL_NAME} again with the whole record.`;

// The model's own call, then the error that answers it.
function correctionTurns(correction: Correction): Record<string, unknown>[] {
  const { previous, malformed } = correction;
  if (previous.toolUseId === undefined) throw new Error('No tool call to correct');
  return [
    {
      role: 'assistant',
      content: [
        {
          type: 'tool_use',
          id: previous.toolUseId,
          name: TOOL_NAME,
          input: previous.toolInput,
        },
      ],
    },
    {
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: previous.toolUseId,
          is_error: true,
          content: correctionMessage(malformed),
        },
      ],
    },
  ];
}

// Everything but the images is fixed: nothing the person sends can reach the prompt. Each image
// is one page, numbered before it («Page 3:») so the model can refer to it.
// Strict tool use (`strict: true`) would rule out a malformed section at the source, but it
// allows 24 optional parameters across a request's schemas and each of these has more than 50
// (test/tool-schema.test.ts counts them).
export function buildRequestBody(
  model: string,
  files: readonly DocumentFile[],
  review: ReviewKind = 'final_pay',
  correction?: Correction,
): Record<string, unknown> {
  const settings = MODEL_SETTINGS[model];
  if (!settings) throw new Error(`No settings for model ${model}`);
  const content: Record<string, unknown>[] = files.flatMap((file, i) => [
    { type: 'text', text: `Page ${i + 1}:` },
    imageBlock(file),
  ]);
  content.push({
    type: 'text',
    text: `That is all ${files.length} pages. Call ${TOOL_NAME} with what they state.`,
  });
  const maxTokens = settings.maxTokens + EXTRA_OUTPUT_TOKENS_BY_REVIEW[review];
  // A retry may write only what the first read left of max_tokens, so the two cost no more than
  // one read can; with less room than the first read took, it could not write the record again.
  const left = maxTokens - (correction?.previous.outputTokens ?? 0);
  if (correction !== undefined && left < correction.previous.outputTokens)
    throw new Error('No room left to correct the read');
  return {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: left,
    system: SYSTEM_PROMPTS[review],
    tools: [
      {
        name: TOOL_NAME,
        description: 'Record the kind of every page and the fields each kind of document states.',
        input_schema: toolInputSchema(review),
      },
    ],
    tool_choice: settings.forcedToolChoice ? { type: 'tool', name: TOOL_NAME } : { type: 'auto' },
    messages: [
      { role: 'user', content },
      ...(correction === undefined ? [] : correctionTurns(correction)),
    ],
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const count = (v: unknown): number =>
  Number.isInteger(v) && (v as number) >= 0 ? (v as number) : 0;

export function parseResponseBody(body: unknown): ModelRead {
  const response = isRecord(body) ? body : {};
  const usage = isRecord(response['usage']) ? response['usage'] : {};
  const content = Array.isArray(response['content']) ? response['content'] : [];
  // A truncated or refused answer is no answer.
  const complete = response['stop_reason'] === 'tool_use' || response['stop_reason'] === 'end_turn';
  const toolUse = content.find(
    (block: unknown) =>
      isRecord(block) && block['type'] === 'tool_use' && block['name'] === TOOL_NAME,
  ) as Record<string, unknown> | undefined;
  const id = complete && toolUse ? toolUse['id'] : undefined;
  return {
    toolInput: complete && toolUse ? (toolUse['input'] ?? null) : null,
    inputTokens: count(usage['input_tokens']),
    outputTokens: count(usage['output_tokens']),
    ...(typeof id === 'string' && { toolUseId: id }),
  };
}

export type Invoke = (modelId: string, body: string, signal: AbortSignal) => Promise<string>;

// One retry at most; the abort signal ends the call and any retry at the read's deadline.
export function bedrockInvoke(
  client = new BedrockRuntimeClient({ region: REGION, maxAttempts: 2 }),
): Invoke {
  return async (modelId, body, signal) => {
    const response = await client.send(
      new InvokeModelCommand({
        modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body,
      }),
      { abortSignal: signal },
    );
    return new TextDecoder().decode(response.body);
  };
}

// Every provider error throws, a validation error included: with fixed requests it means the
// model is retired, not enabled or misconfigured, not that the document is at fault.
export function createBedrockReader(invoke: Invoke): DocumentReader {
  return {
    async read({ model, review, files, deadline, correction }) {
      const request = buildRequestBody(model, files, review, correction);
      const body = JSON.stringify(request);
      const signal = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
      const raw = await invoke(model, body, signal);
      return { ...parseResponseBody(JSON.parse(raw)), maxTokens: request['max_tokens'] as number };
    },
  };
}
