import { describe, expect, it } from 'vitest';
import { buildRequestBody, createBedrockReader } from '../src/adapters/bedrock-reader';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { HAIKU_4_5, MODEL_SETTINGS, SONNET_4_6 } from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import {
  extract,
  NO_ESCALATION_AFTER_MS,
  type ExtractDeps,
  type ExtractMetrics,
} from '../src/domain/extract';
import { malformedParts } from '../src/domain/extraction';
import type { ReviewKind } from '../src/domain/reviews';
import { EXTRA_OUTPUT_TOKENS_BY_REVIEW } from '../src/domain/tokens';
import { FakeCaptcha, FakeClock, FakePayments } from './support/fakes';
import { recording, type Recording } from './support/recorded';
import { jpeg } from './support/synthetic';

// Recorded responses, made malformed the way Sonnet 4.6 did it: one section sent as a string of
// JSON that is not even valid JSON. No model is called.

const photo: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1176, 1568, 'FICTICIO') };

type Body = Record<string, unknown> & {
  content: Record<string, unknown>[];
  usage: { input_tokens: number; output_tokens: number };
};

const responseOf = (name: Recording): Body => JSON.parse(recording(name)) as Body;
const toolUseOf = (body: Body) =>
  body.content.find((b) => b['type'] === 'tool_use') as { input: Record<string, unknown> };

// The section as a string, with a doubled comma after its first value.
function stringified(name: Recording, section: string, usage?: Partial<Body['usage']>): Body {
  const body = responseOf(name);
  const input = toolUseOf(body).input;
  input[section] = JSON.stringify(input[section]).replace('",', '",,');
  body.usage = { ...body.usage, ...usage };
  return body;
}

interface Sent {
  readonly modelId: string;
  readonly body: Record<string, unknown>;
}

// The real Bedrock adapter, answering each model's calls in turn.
function scriptedReader(
  answers: Readonly<Record<string, readonly Body[]>>,
  during: () => void = () => {},
) {
  const sent: Sent[] = [];
  const reader = createBedrockReader(async (modelId, body) => {
    sent.push({ modelId, body: JSON.parse(body) as Record<string, unknown> });
    during();
    const answer = answers[modelId]?.[sent.filter((s) => s.modelId === modelId).length - 1];
    if (!answer) throw new Error(`No answer left for ${modelId}`);
    return JSON.stringify(answer);
  });
  return { reader, sent };
}

async function run(
  reader: ExtractDeps['reader'],
  review: ReviewKind,
  pages: number,
  options: { clock?: FakeClock; escalation?: string } = {},
) {
  const metrics: ExtractMetrics = {};
  const response = await extract(
    {
      files: Array.from({ length: pages }, () => photo),
      captchaToken: 'turnstile-token',
      allowance: { type: 'free', token: null },
      review,
    },
    {
      reader,
      captcha: new FakeCaptcha(),
      signer: createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256'),
      payments: new FakePayments({}),
      clock: options.clock ?? new FakeClock(),
      models: { primary: SONNET_4_6, escalation: options.escalation ?? SONNET_4_6 },
    },
    metrics,
  );
  return { response, metrics };
}

const maxTokens = (review: ReviewKind) =>
  (MODEL_SETTINGS[SONNET_4_6]?.maxTokens ?? 0) + EXTRA_OUTPUT_TOKENS_BY_REVIEW[review];

const cases = [
  ['final_pay', 'settlement-confident', 'settlement_proposal', 1],
  ['rental', 'rental-lease', 'lease', 4],
  ['employment', 'employment-production', 'employment_contract', 2],
  ['credit', 'credit-personal-loan', 'credit_agreement', 5],
  ['insurance', 'insurance-home-renewal', 'insurance_policy', 3],
] as const;

describe('a read whose tool input has a section of the wrong type', () => {
  it.each(cases)(
    'is retried once with the same model for a %s read, and the retry is kept',
    async (review, name, section, pages) => {
      const bad = stringified(name, section);
      const good = responseOf(name);
      const { reader, sent } = scriptedReader({ [SONNET_4_6]: [bad, good] });
      const { response, metrics } = await run(reader, review, pages);

      expect(response.code).toBe('ok');
      expect(metrics).toMatchObject({
        retried: true,
        escalated: false,
        inputTokens: bad.usage.input_tokens + good.usage.input_tokens,
        outputTokens: bad.usage.output_tokens + good.usage.output_tokens,
      });
      expect(sent.map((s) => s.modelId)).toEqual([SONNET_4_6, SONNET_4_6]);

      const [first, second] = sent.map((s) => s.body);
      // The same request, with the model's own call and the error answering it after it.
      expect(second?.['system']).toBe(first?.['system']);
      expect(second?.['tools']).toEqual(first?.['tools']);
      expect(second?.['tool_choice']).toEqual(first?.['tool_choice']);
      const messages = second?.['messages'] as Record<string, unknown>[];
      expect(messages[0]).toEqual((first?.['messages'] as unknown[])[0]);
      expect(messages.slice(1)).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_bdrk_01FICTITIOUS',
              name: 'record_extraction',
              input: toolUseOf(bad).input,
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'toolu_bdrk_01FICTITIOUS',
              is_error: true,
              content: `The tool input was rejected: ${section} must be a JSON object, never a string. Call record_extraction again with the whole record.`,
            },
          ],
        },
      ]);
      // Both reads together write no more than one read may.
      expect(first?.['max_tokens']).toBe(maxTokens(review));
      expect(second?.['max_tokens']).toBe(maxTokens(review) - bad.usage.output_tokens);
    },
  );

  it('answers nothing_read when the retry is malformed too, and reads no third time', async () => {
    const bad = stringified('employment-production', 'employment_contract');
    const { reader, sent } = scriptedReader({ [SONNET_4_6]: [bad, bad] });
    const { response, metrics } = await run(reader, 'employment', 2);
    expect(response.code).toBe('nothing_read');
    expect(metrics.retried).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('keeps the first read when the retry fails', async () => {
    const bad = stringified('employment-production', 'employment_contract');
    const { reader, sent } = scriptedReader({ [SONNET_4_6]: [bad] });
    const { response, metrics } = await run(reader, 'employment', 2);
    expect(response.code).toBe('nothing_read');
    expect(metrics.retried).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it('is not retried when both reads could take more input than one read may', async () => {
    const bad = stringified('employment-production', 'employment_contract', {
      input_tokens: 48_000,
    });
    const { reader, sent } = scriptedReader({
      [SONNET_4_6]: [bad, responseOf('employment-production')],
    });
    const { response, metrics } = await run(reader, 'employment', 2);
    expect(response.code).toBe('nothing_read');
    expect(metrics.retried).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('is not retried when the first read took more than half of max_tokens', async () => {
    const bad = stringified('settlement-confident', 'settlement_proposal', {
      output_tokens: maxTokens('final_pay') / 2 + 1,
    });
    const { reader, sent } = scriptedReader({
      [SONNET_4_6]: [bad, responseOf('settlement-confident')],
    });
    const { response, metrics } = await run(reader, 'final_pay', 1);
    expect(response.code).toBe('nothing_read');
    expect(metrics.retried).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('is not retried once a second read could run out of time', async () => {
    const clock = new FakeClock();
    const bad = stringified('employment-production', 'employment_contract');
    const { reader, sent } = scriptedReader(
      { [SONNET_4_6]: [bad, responseOf('employment-production')] },
      () => (clock.ms += NO_ESCALATION_AFTER_MS),
    );
    const { response, metrics } = await run(reader, 'employment', 2, { clock });
    expect(response.code).toBe('nothing_read');
    expect(metrics.retried).toBe(false);
    expect(sent).toHaveLength(1);
  });

  it('retries the primary model rather than escalating, and makes one second read at most', async () => {
    const bad = stringified('employment-production', 'employment_contract');
    const { reader, sent } = scriptedReader({
      [HAIKU_4_5]: [bad, bad],
      [SONNET_4_6]: [responseOf('employment-production')],
    });
    const metrics: ExtractMetrics = {};
    const response = await extract(
      {
        files: [photo, photo],
        captchaToken: 'turnstile-token',
        allowance: { type: 'free', token: null },
        review: 'employment',
      },
      {
        reader,
        captcha: new FakeCaptcha(),
        signer: createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256'),
        payments: new FakePayments({}),
        clock: new FakeClock(),
        models: { primary: HAIKU_4_5, escalation: SONNET_4_6 },
      },
      metrics,
    );
    expect(response.code).toBe('nothing_read');
    expect(metrics).toMatchObject({ retried: true, escalated: false });
    expect(sent.map((s) => s.modelId)).toEqual([HAIKU_4_5, HAIKU_4_5]);
  });

  it('escalates as before a doubtful read that is well formed', async () => {
    const { reader, sent } = scriptedReader({
      [SONNET_4_6]: [responseOf('settlement-doubtful'), responseOf('settlement-escalated')],
    });
    const { metrics } = await run(reader, 'final_pay', 1, { escalation: SONNET_4_6 });
    expect(metrics).toMatchObject({ retried: false, escalated: false });
    expect(sent).toHaveLength(1);
  });
});

describe('malformedParts', () => {
  it('names pages that are not a list and sections that are not objects', () => {
    expect(
      malformedParts(
        {
          pages: '[{"page": 1}]',
          employment_contract: '{"employerType": {}}',
          job_offer: [],
          employment_payslips: {},
        },
        'employment',
      ),
    ).toEqual(['pages', 'employment_contract', 'job_offer']);
  });

  it('names nothing in a well-formed input, nor keys outside the review', () => {
    const input = toolUseOf(responseOf('employment-production')).input;
    expect(malformedParts(input, 'employment')).toEqual([]);
    expect(malformedParts({ ...input, lease: 'text' }, 'employment')).toEqual([]);
    expect(malformedParts(null, 'employment')).toEqual([]);
  });
});

describe('buildRequestBody with a correction', () => {
  it('refuses to correct a read with no tool call to answer', () => {
    expect(() =>
      buildRequestBody(SONNET_4_6, [photo], 'final_pay', {
        previous: { toolInput: { pages: 'x' }, inputTokens: 100, outputTokens: 10 },
        malformed: ['pages'],
      }),
    ).toThrow();
  });

  it('refuses to correct a read that left less room than it took', () => {
    expect(() =>
      buildRequestBody(SONNET_4_6, [photo], 'final_pay', {
        previous: {
          toolInput: { pages: 'x' },
          inputTokens: 100,
          outputTokens: maxTokens('final_pay') / 2 + 1,
          toolUseId: 'toolu_1',
        },
        malformed: ['pages'],
      }),
    ).toThrow();
  });

  it('tells the model pages must be an array', () => {
    const body = buildRequestBody(SONNET_4_6, [photo], 'final_pay', {
      previous: {
        toolInput: { pages: 'x' },
        inputTokens: 100,
        outputTokens: 10,
        toolUseId: 'toolu_1',
      },
      malformed: ['pages', 'settlement_proposal'],
    });
    expect(JSON.stringify(body['messages'])).toContain(
      'pages must be an array; settlement_proposal must be a JSON object, never a string.',
    );
  });
});
