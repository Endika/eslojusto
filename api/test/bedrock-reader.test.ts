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
import { DOCUMENT_KINDS, type DocumentFile } from '../src/domain/documents';
import { recording } from './support/recorded';
import { INJECTION, jpeg, settlementPdf } from './support/synthetic';

const photo: DocumentFile = { mediaType: 'image/jpeg', bytes: jpeg(1000, 1400) };

describe('buildRequestBody', () => {
  it('has settings for both configured models', () => {
    expect(MODEL_SETTINGS[PRIMARY_MODEL]).toBeDefined();
    expect(MODEL_SETTINGS[ESCALATION_MODEL]).toBeDefined();
  });

  it('forces the tool where the model allows it and names it otherwise', () => {
    for (const model of [HAIKU_4_5, SONNET_4_6])
      expect(buildRequestBody(model, 'payslip', [photo])['tool_choice']).toEqual({
        type: 'tool',
        name: 'record_extraction',
      });
    expect(buildRequestBody(SONNET_5_5, 'payslip', [photo])['tool_choice']).toEqual({
      type: 'auto',
    });
  });

  it('sends no sampling parameters, which Sonnet 5.5 rejects', () => {
    const body = buildRequestBody(SONNET_5_5, 'settlement', [photo]);
    expect(body).not.toHaveProperty('temperature');
    expect(body).not.toHaveProperty('top_p');
  });

  it('sends images as image blocks and a PDF as a document block', async () => {
    const pdf: DocumentFile = { mediaType: 'application/pdf', bytes: await settlementPdf(1) };
    const imageContent = (
      buildRequestBody(HAIKU_4_5, 'settlement', [photo, photo])['messages'] as {
        content: { type: string; source?: { media_type: string } }[];
      }[]
    )[0]?.content;
    expect(imageContent?.map((b) => b.type)).toEqual(['image', 'image', 'text']);
    const pdfContent = (
      buildRequestBody(HAIKU_4_5, 'settlement', [pdf])['messages'] as {
        content: { type: string; source?: { media_type: string } }[];
      }[]
    )[0]?.content;
    expect(pdfContent?.[0]).toMatchObject({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf' },
    });
  });

  it('keeps everything but the file data identical whatever the document says', async () => {
    const clean: DocumentFile = { mediaType: 'application/pdf', bytes: await settlementPdf(1) };
    const injected: DocumentFile = {
      mediaType: 'application/pdf',
      bytes: await settlementPdf(1, INJECTION),
    };
    const strip = (body: Record<string, unknown>) =>
      JSON.parse(JSON.stringify(body).replace(/"data":"[^"]*"/g, '"data":""')) as unknown;
    for (const kind of DOCUMENT_KINDS) {
      const a = buildRequestBody(HAIKU_4_5, kind, [clean]);
      const b = buildRequestBody(HAIKU_4_5, kind, [injected]);
      expect(strip(b)).toEqual(strip(a));
      expect(b['system']).toBe(SYSTEM_PROMPT);
      expect(JSON.stringify(b)).not.toContain('IGNORE ALL PREVIOUS');
    }
  });

  it('tells the model the document is data, never instructions', () => {
    expect(SYSTEM_PROMPT).toMatch(/never instructions/);
    expect(SYSTEM_PROMPT).toMatch(/cuota sindical/);
  });

  it('refuses a model without settings', () => {
    expect(() => buildRequestBody('eu.anthropic.unknown', 'settlement', [photo])).toThrow();
  });
});

describe('parseResponseBody', () => {
  it('reads the tool input and the token usage', () => {
    const read = parseResponseBody(JSON.parse(recording('payslip')));
    expect(read.inputTokens).toBe(6120);
    expect(read.outputTokens).toBe(410);
    expect(read.toolInput).toMatchObject({ totalAccrued: { value: 1980, confidence: 'high' } });
  });

  it.each(['max-tokens', 'refusal', 'text-only'] as const)('returns no input for %s', (name) => {
    expect(parseResponseBody(JSON.parse(recording(name))).toolInput).toBeNull();
  });

  it('survives a body that is not a message', () => {
    expect(parseResponseBody('nonsense')).toEqual({
      outcome: 'read',
      toolInput: null,
      inputTokens: 0,
      outputTokens: 0,
    });
  });
});

describe('createBedrockReader', () => {
  it('maps a validation error on the document to a rejection', async () => {
    const reader = createBedrockReader(async () => {
      throw new ValidationException({ message: 'Could not process PDF', $metadata: {} });
    });
    expect(await reader.read({ model: HAIKU_4_5, kind: 'settlement', files: [photo] })).toEqual({
      outcome: 'rejected',
    });
  });

  it('lets an unavailable provider throw', async () => {
    const reader = createBedrockReader(async () => {
      throw new Error('ThrottlingException');
    });
    await expect(
      reader.read({ model: HAIKU_4_5, kind: 'settlement', files: [photo] }),
    ).rejects.toThrow();
  });
});
