import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint({ cwd: fileURLToPath(new URL('..', import.meta.url)) });

// The rules that fired on `code` as if it lived at `filePath`; nothing is written to disk.
async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe('api import boundaries', () => {
  it.each([
    ['src/domain/x.ts', "import { REGION } from '../config';"],
    ['src/domain/x.ts', "import { createHash } from 'node:crypto';"],
    ['src/domain/x.ts', "import Stripe from 'stripe';"],
    ['src/domain/x.ts', "import { createTurnstileVerifier } from '../adapters/turnstile';"],
    ['src/http/x.ts', "import { createTurnstileVerifier } from '../adapters/turnstile';"],
    ['src/http/x.ts', "import { REGION } from '../config';"],
    ['src/http/x.ts', "import Stripe from 'stripe';"],
    ['src/adapters/x.ts', "import { handleExtract } from '../http/extract';"],
    ['src/adapters/x.ts', "import { handler } from '../handlers/extract';"],
    ['src/config.ts', "import { LIMITS } from './domain/documents';"],
    ['infra/x.ts', "import { createTurnstileVerifier } from '../src/adapters/turnstile';"],
    ['eval/x.ts', "import { createBedrockReader } from '../src/adapters/bedrock-reader';"],
    ['eval/x.ts', "import { REGION } from '../src/config';"],
  ])('%s cannot %s', async (filePath, code) => {
    expect(await violations(filePath, code)).toContain('no-restricted-imports');
  });

  it('the domain cannot read the clock or the environment', async () => {
    const fired = await violations(
      'src/domain/x.ts',
      'export const now = () => [Date.now(), performance.now(), process.env];',
    );
    expect(fired).toEqual(
      expect.arrayContaining(['no-restricted-properties', 'no-restricted-globals']),
    );
    expect(fired.filter((r) => r === 'no-restricted-globals')).toHaveLength(2);
  });

  it('a dynamic import cannot slip past them', async () => {
    expect(
      await violations('src/domain/x.ts', "export const a = import('../adapters/runtime');"),
    ).toContain('no-restricted-syntax');
  });

  it.each([
    ['src/domain/x.ts', "import { LIMITS } from './documents';"],
    ['src/http/x.ts', "import { extract } from '../domain/extract';"],
    ['src/adapters/x.ts', "import { REGION } from '../config';"],
    ['src/adapters/x.ts', "import type { Clock } from '../domain/ports';"],
    ['src/handlers/x.ts', "import { createTurnstileVerifier } from '../adapters/turnstile';"],
    ['infra/x.ts', "import { REGION } from '../src/config';"],
    ['eval/x.ts', "import { extract } from '../src/domain/extract';"],
    ['eval/run.ts', "import { createBedrockReader } from '../src/adapters/bedrock-reader';"],
  ])('%s may %s', async (filePath, code) => {
    expect(await violations(filePath, code)).not.toContain('no-restricted-imports');
  });
});
