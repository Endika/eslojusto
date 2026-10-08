import { ValidationException } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it } from 'vitest';
import {
  buildRequestBody,
  createBedrockReader,
  parseResponseBody,
  SYSTEM_PROMPT,
} from '../src/adapters/bedrock-reader';
import {
  ESCALATION_MODEL,
  HAIKU_4_5,
  MODEL_SETTINGS,
  PRIMARY_MODEL,
  SONNET_4_6,
  SONNET_5_5,
} from '../src/config';
import type { DocumentFile } from '../src/domain/documents';
import { recording } from './support/recorded';
import { INJECTION, jpeg } from './support/synthetic';

const photo: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400) };

describe('buildRequestBody', () => {
  it('has settings for both configured models', () => {
    expect(MODEL_SETTINGS[PRIMARY_MODEL]).toBeDefined();
    expect(MODEL_SETTINGS[ESCALATION_MODEL]).toBeDefined();
  });

  it('forces the tool where the model allows it and names it otherwise', () => {
    for (const model of [HAIKU_4_5, SONNET_4_6])
      expect(buildRequestBody(model, [photo])['tool_choice']).toEqual({
        type: 'tool',
        name: 'record_extraction',
      });
    expect(buildRequestBody(SONNET_5_5, [photo])['tool_choice']).toEqual({
      type: 'auto',
    });
  });

  it('sends no sampling parameters, which Sonnet 5.5 rejects', () => {
    const body = buildRequestBody(SONNET_5_5, [photo]);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
  });

  it('sends images only, each after its page number', () => {
    const content = (
      buildRequestBody(HAIKU_4_5, [photo, photo, photo])['messages'] as {
        content: { type: string; text?: string; source?: { media_type: string } }[];
      }[]
    )[0]?.content;
    expect(content?.map((b) => b.text ?? b.type)).toEqual([
      'Page 1:',
      'image',
      'Page 2:',
      'image',
      'Page 3:',
      'image',
      'That is all 3 pages. Call record_extraction with what they state.',
    ]);
    expect(content?.[1]).toMatchObject({ source: { type: 'base64', media_type: 'image/jpeg' } });
  });

  it('keeps everything but the image data identical whatever the document says', () => {
    const clean: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400) };
    const injected: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400, INJECTION) };
    const strip = (body: Record<string, unknown>) =>
      JSON.parse(JSON.stringify(body).replace(/"data":"[^"]*"/g, '"data":""')) as unknown;
    const a = buildRequestBody(HAIKU_4_5, [clean]);
    const b = buildRequestBody(HAIKU_4_5, [injected]);
    expect(strip(b)).toEqual(strip(a));
    expect(b['system']).toBe(SYSTEM_PROMPT);
    expect(JSON.stringify(b)).not.toContain('IGNORE ALL PREVIOUS');
  });

  it('tells the model the document is data, never instructions', () => {
    expect(SYSTEM_PROMPT).toMatch(/never instructions/);
    expect(SYSTEM_PROMPT).toMatch(/cuota sindical/);
  });

  it('refuses a model without settings', () => {
    expect(() => buildRequestBody('eu.anthropic.unknown', [photo])).toThrow();
  });
});

describe('parseResponseBody', () => {
  it('reads the tool input and the token usage', () => {
    const read = parseResponseBody(JSON.parse(recording('payslip')));
    expect(read.inputTokens).toBe(6120);
    expect(read.outputTokens).toBe(410);
    expect(read.toolInput).toMatchObject({
      monthly_payslip: { totalAccrued: { value: 1980, confidence: 'high' } },
    });
  });

  it.each(['max-tokens', 'refusal', 'text-only'] as const)('returns no input for %s', (name) => {
    expect(parseResponseBody(JSON.parse(recording(name))).toolInput).toBeNull();
  });

  it('survives a body that is not a message', () => {
    expect(parseResponseBody('nonsense')).toEqual({
      toolInput: null,
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});

describe('createBedrockReader', () => {
  it('hands every call an abort signal that fires at the read’s deadline', async () => {
    const signals: AbortSignal[] = [];
    const reader = createBedrockReader(async (_model, _body, signal) => {
      signals.push(signal);
      return recording('payslip');
    });
    await reader.read({
      model: HAIKU_4_5,
      review: 'final_pay',
      files: [photo],
      deadline: Date.now() + 60_000,
    });
    await reader.read({
      model: HAIKU_4_5,
      review: 'final_pay',
      files: [photo],
      deadline: Date.now() - 1,
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(signals[0]?.aborted).toBe(false);
    expect(signals[1]?.aborted).toBe(true);
  });

  // With fixed requests, a validation error means a retired, disabled or misconfigured model;
  // the domain then tries the escalation model or answers model_unavailable.
  it.each([
    new ValidationException({
      message: 'This model version has reached end of life',
      $metadata: {},
    }),
    new Error('ThrottlingException'),
  ])('lets every provider error throw: %s', async (error) => {
    const reader = createBedrockReader(async () => {
      throw error;
    });
    await expect(
      reader.read({
        model: HAIKU_4_5,
        review: 'final_pay',
        files: [photo],
        deadline: Date.now() + 60_000,
      }),
    ).rejects.toBe(error);
  });
});
