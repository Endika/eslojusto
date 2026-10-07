import { readFileSync } from 'node:fs';
import { createBedrockReader } from '../../src/adapters/bedrock-reader';

export type Recording =
  | 'settlement-confident'
  | 'settlement-doubtful'
  | 'settlement-escalated'
  | 'payslip'
  | 'work-history'
  | 'pack'
  | 'injected'
  | 'max-tokens'
  | 'refusal'
  | 'text-only';

export const recording = (name: Recording): string =>
  readFileSync(new URL(`../fixtures/bedrock/${name}.json`, import.meta.url), 'utf8');

// The real Bedrock adapter, answering each model with a recorded response body.
export function recordedReader(byModel: Readonly<Record<string, Recording>>) {
  const requests: { modelId: string; body: Record<string, unknown> }[] = [];
  const reader = createBedrockReader(async (modelId, body) => {
    requests.push({ modelId, body: JSON.parse(body) as Record<string, unknown> });
    const name = byModel[modelId];
    if (!name) throw new Error(`No recording for ${modelId}`);
    return recording(name);
  });
  return { reader, requests };
}
