import { describe, expect, it } from 'vitest';
import { buildLocateBody, parseResponseBody } from '../src/adapters/bedrock-reader';
import { createHmacSigner } from '../src/adapters/hmac-signer';
import { LOCATE_PROMPTS, LOCATE_TOOL_NAME, locateToolSchema } from '../src/adapters/prompts/locate';
import { HAIKU_4_5 } from '../src/config';
import { passClaims } from '../src/domain/allowance';
import { chosenPages, LOCATE_PROMPT_TOKENS } from '../src/domain/locate';
import type { HttpEvent } from '../src/http/common';
import { handleExtract } from '../src/http/extract';
import {
  CREATED,
  ESCALATION,
  FakeCaptcha,
  FakeClock,
  FakeLocator,
  FakePayments,
  FakeReader,
  LOCATE,
  MemoryLogger,
  paidSession,
  PRIMARY,
  read,
} from './support/fakes';
import { jpeg } from './support/synthetic';

const signer = createHmacSigner('test-key-that-is-long-enough-for-hmac-sha256');
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
const post = (body: unknown): HttpEvent => ({
  body: JSON.stringify(body),
  isBase64Encoded: false,
  requestContext: { http: { method: 'POST' } },
});
const json = (r: { body: string }) => JSON.parse(r.body) as Record<string, unknown>;

const lowRes = (n: number) =>
  Array.from({ length: n }, () => ({ mediaType: 'image/jpeg', data: b64(jpeg(543, 768)) }));

const locateBody = (overrides: Record<string, unknown> = {}) => ({
  step: 'locate',
  review: 'mortgage',
  maxPages: 25,
  files: lowRes(57),
  captchaToken: 'turnstile-token',
  ...overrides,
});

function setup(
  options: {
    answer?: ReturnType<typeof read> | Error;
    captcha?: FakeCaptcha;
    payments?: FakePayments;
    clock?: FakeClock;
  } = {},
) {
  const logger = new MemoryLogger();
  const locator = new FakeLocator(options.answer ?? read({ pages: [] }));
  const reader = new FakeReader({ [PRIMARY]: read(null), [ESCALATION]: read(null) });
  const captcha = options.captcha ?? new FakeCaptcha();
  const clock = options.clock ?? new FakeClock();
  const deps = {
    reader,
    captcha,
    signer,
    payments: options.payments ?? new FakePayments({}),
    clock,
    models: { primary: PRIMARY, escalation: ESCALATION },
    locate: { locator, model: LOCATE },
    logger,
  };
  return { deps, logger, locator, reader, captcha, clock };
}

const listed = (...pages: unknown[]) =>
  read({ pages: pages.map((page) => ({ page, holds: 'loan_terms' })) }, 30_000, 300);

describe('which pages a locate answer picks', () => {
  it('keeps the most useful first up to the places left, then puts them in order', () => {
    expect(chosenPages({ pages: [{ page: 30 }, { page: 4 }, { page: 12 }] }, 57, 2)).toEqual([
      4, 30,
    ]);
  });

  it('drops pages named twice, out of range or not whole numbers', () => {
    const input = {
      pages: [{ page: 3 }, { page: 3 }, { page: 0 }, { page: 58 }, { page: 2.5 }, { page: '7' }],
    };
    expect(chosenPages(input, 57, 25)).toEqual([3]);
    expect(chosenPages(null, 57, 25)).toEqual([]);
    expect(chosenPages({ pages: 'all' }, 57, 25)).toEqual([]);
  });
});

describe('the locate step', () => {
  it('answers the chosen pages, and spends no read', async () => {
    const { deps, locator, logger } = setup({ answer: listed(40, 3, 4) });
    const response = await handleExtract(post(locateBody()), deps);
    expect(response.statusCode).toBe(200);
    const body = json(response);
    expect(body).toEqual({ code: 'ok', pages: [3, 4, 40] });
    expect(locator.calls).toHaveLength(1);
    expect(locator.calls[0]).toMatchObject({ model: LOCATE, review: 'mortgage' });
    expect(locator.calls[0]?.files).toHaveLength(57);
    expect(logger.events[0]).toMatchObject({
      op: 'extract',
      code: 'ok',
      step: 'locate',
      review: 'mortgage',
      pages: 57,
      inputTokens: 30_000,
    });
  });

  it('cuts the pages to the places the read has left', async () => {
    const { deps } = setup({ answer: listed(9, 8, 7, 6, 5) });
    expect(json(await handleExtract(post(locateBody({ maxPages: 3 })), deps))).toMatchObject({
      pages: [7, 8, 9],
    });
  });

  it('takes 80 square pages at 768 px within its token cap', async () => {
    const { deps } = setup({ answer: listed(1) });
    const square = Array.from({ length: 80 }, () => ({
      mediaType: 'image/jpeg',
      data: b64(jpeg(768, 768)),
    }));
    expect(json(await handleExtract(post(locateBody({ files: square })), deps))).toEqual({
      code: 'ok',
      pages: [1],
    });
  });

  it('takes up to 80 pages of at most 1024 px, and no more', async () => {
    const { deps } = setup({ answer: listed(1) });
    expect((await handleExtract(post(locateBody({ files: lowRes(80) })), deps)).statusCode).toBe(
      200,
    );
    expect(json(await handleExtract(post(locateBody({ files: lowRes(81) })), deps))).toEqual({
      code: 'too_many_files',
    });
    const big = [{ mediaType: 'image/jpeg', data: b64(jpeg(1100, 1568)) }];
    expect(json(await handleExtract(post(locateBody({ files: big })), deps))).toEqual({
      code: 'image_too_large',
    });
  });

  it('refuses a review without locate, a bad maxPages or a handoff in place of the captcha', async () => {
    const { deps, locator } = setup({ answer: listed(1) });
    for (const overrides of [
      { review: 'rental' },
      { review: undefined },
      { maxPages: 0 },
      { maxPages: 26 },
      { maxPages: 2.5 },
      { captchaToken: undefined },
    ])
      expect(json(await handleExtract(post(locateBody(overrides)), deps))).toEqual({
        code: 'invalid_request',
      });
    expect(json(await handleExtract(post(locateBody({ step: 'other' })), deps))).toEqual({
      code: 'invalid_request',
    });
    expect(locator.calls).toHaveLength(0);
  });

  it('checks the captcha, and answers as the read would when no read is left', async () => {
    const refused = setup({ captcha: new FakeCaptcha(false), answer: listed(1) });
    expect(json(await handleExtract(post(locateBody()), refused.deps))).toEqual({
      code: 'captcha_failed',
    });
    expect(refused.locator.calls).toHaveLength(0);

    const spent = setup({ answer: listed(1) });
    const quota = signer.sign({ typ: 'quota', day: '2026-10-07', used: 2 });
    expect(json(await handleExtract(post(locateBody({ quota })), spent.deps))).toEqual({
      code: 'daily_limit_reached',
    });

    const pass = signer.sign(passClaims('cs_test_paid', CREATED + 86_400));
    const exhausted = setup({
      answer: listed(1),
      payments: new FakePayments({ cs_test_paid: paidSession({ readsUsed: 15 }) }),
    });
    expect(json(await handleExtract(post(locateBody({ pass })), exhausted.deps))).toEqual({
      code: 'pass_exhausted',
    });
    expect(exhausted.locator.calls).toHaveLength(0);
  });

  it('answers model_unavailable when the model fails and document_unreadable when it picks none', async () => {
    const down = setup({ answer: new Error('throttled') });
    expect(json(await handleExtract(post(locateBody()), down.deps))).toEqual({
      code: 'model_unavailable',
    });
    const none = setup({ answer: read({ pages: [] }) });
    expect(json(await handleExtract(post(locateBody()), none.deps))).toEqual({
      code: 'document_unreadable',
    });
  });
});

describe('the read after locate', () => {
  it('needs its own captcha: nothing from the locate step stands in for it', async () => {
    const { deps, reader } = setup();
    const files = [{ mediaType: 'image/jpeg', data: b64(jpeg(1000, 1400)) }];
    expect(
      json(await handleExtract(post({ review: 'mortgage', files, handoff: 'v1.x' }), deps)),
    ).toEqual({ code: 'invalid_request' });
    expect(reader.calls).toHaveLength(0);
  });
});

describe('the locate request to Bedrock', () => {
  it('sends every page numbered, with its own prompt and tool, forced on Haiku', () => {
    const files = [{ mediaType: 'image/jpeg' as const, bytes: jpeg(543, 768) }];
    const body = buildLocateBody(HAIKU_4_5, [...files, ...files], 'mortgage');
    expect(body['system']).toBe(LOCATE_PROMPTS.mortgage);
    expect(body['max_tokens']).toBe(2000);
    expect(body['tool_choice']).toEqual({ type: 'tool', name: LOCATE_TOOL_NAME });
    const content = (body['messages'] as { content: { type: string; text?: string }[] }[])[0]
      ?.content;
    expect(content?.filter((c) => c.type === 'image')).toHaveLength(2);
    expect(content?.[0]).toEqual({ type: 'text', text: 'Page 1:' });
    expect(content?.at(-1)?.text).toContain('That is all 2 pages');
  });

  it('reads the answer of its own tool only', () => {
    const answer = (name: string) => ({
      stop_reason: 'tool_use',
      usage: { input_tokens: 31_000, output_tokens: 250 },
      content: [{ type: 'tool_use', id: 't', name, input: { pages: [{ page: 2 }] } }],
    });
    expect(parseResponseBody(answer(LOCATE_TOOL_NAME), LOCATE_TOOL_NAME).toolInput).toEqual({
      pages: [{ page: 2 }],
    });
    expect(parseResponseBody(answer('record_documents'), LOCATE_TOOL_NAME).toolInput).toBeNull();
  });

  it('keeps its prompt and tool within LOCATE_PROMPT_TOKENS at two characters a token', () => {
    const chars =
      LOCATE_PROMPTS.mortgage.length + JSON.stringify(locateToolSchema('mortgage')).length + 600;
    expect(Math.ceil(chars / 2)).toBeLessThanOrEqual(LOCATE_PROMPT_TOKENS);
  });
});
