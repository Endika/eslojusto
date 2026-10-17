import { describe, expect, it } from 'vitest';
import type {
  Api,
  ErrorCode,
  ExtractedFieldName,
  ExtractRequest,
  ExtractResult,
  LocateRequest,
  LocateResult,
  PassResult,
} from '../../src/documents/contract';
import { createPassStore, STORAGE_KEYS, type StoredPass } from '../../src/documents/pass';
import type { EncodedFile, OpenedPdf } from '../../src/documents/ports';
import {
  REFUSALS,
  allowanceFor,
  encodeAll,
  locatePages,
  sendRead,
  settleRefusal,
  type ReadingDeps,
} from '../../src/documents/reading';
import { memoryStore, passToken } from './fixtures';

const NOW = Date.UTC(2026, 9, 7);
const EXP = NOW / 1000 + 3600;
const SESSION = 'cs_test_a';
const NONCE = 'n'.repeat(32);
const QUOTA = passToken({ typ: 'quota', day: '2026-10-07', used: 1 });
const pass = (extra: Partial<StoredPass> = {}): StoredPass => ({
  token: passToken({ typ: 'pass', sid: SESSION, exp: EXP }),
  expiresAt: EXP,
  readsLeft: 9,
  ...extra,
});

type Read = Extract<ExtractResult, { ok: true }>;
const read: Read = {
  ok: true,
  extraction: {
    pages: [{ page: 1, kind: 'settlement_proposal', readability: 'ok' }],
    documents: [{ kind: 'settlement_proposal', pages: 1 }],
    fields: {},
    contracts: [],
    conflicts: [],
  },
  failedChecks: [],
  allowance: 'v1.quota.next',
  readsLeft: null,
  escalated: false,
};

const image = (data: string): EncodedFile => ({ mediaType: 'image/jpeg', data, bytes: 1 });

// A PDF whose pages draw as their number; `slow` pages give up, as a heavy scan does.
function fakePdf(pages: number, slow: readonly number[] = []) {
  const rendered: number[] = [];
  const closed: number[] = [];
  const opened: OpenedPdf = {
    pages,
    render: async (n) => {
      rendered.push(n);
      return slow.includes(n) ? 'pdf_too_slow' : image(`page ${n}`);
    },
    close: () => void closed.push(1),
  };
  return { opened, rendered, closed };
}

// The API, captcha, encoder and pass store a read talks to, recording every call in `calls`.
function setUp(
  answers: {
    extract?: ExtractResult;
    locate?: LocateResult;
    passAgain?: PassResult;
    captchaFails?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const extracts: ExtractRequest[] = [];
  const locates: LocateRequest[] = [];
  const store = memoryStore();
  const passes = createPassStore(store, () => NOW);
  const state = { current: true };
  // Called on each step, to leave for the form at a given one.
  const steps: Partial<Record<string, () => void>> = {};
  const step = (name: string) => {
    calls.push(name);
    steps[name]?.();
  };
  const api: Api = {
    extract: async (r) => {
      step('extract');
      extracts.push(r);
      return answers.extract ?? read;
    },
    locate: async (r) => {
      step('locate');
      locates.push(r);
      return answers.locate ?? { ok: true, pages: [2, 5] };
    },
    pass: async (sessionId) => {
      step(`pass ${sessionId}`);
      return answers.passAgain ?? { ok: false, code: 'service_unavailable' };
    },
    checkout: async () => ({ ok: false, code: 'service_unavailable' }),
    verify: async () => ({ ok: false, code: 'service_unavailable' }),
  };
  const progress: string[] = [];
  const deps: ReadingDeps<ExtractedFieldName, 'contracts'> = {
    api,
    captcha: {
      token: async () => {
        step('captcha');
        if (answers.captchaFails) throw new Error('blocked');
        return 'captcha';
      },
    },
    encoder: {
      encode: async (file) => {
        step(`encode ${file.name}`);
        return image(file.name);
      },
    },
    passes,
    now: () => NOW,
    current: () => state.current,
    progress: (kind, k, total) => void progress.push(`${kind} ${k}/${total}`),
  };
  const redeemed = () => {
    passes.addCheckout({ nonce: NONCE, sessionId: SESSION });
    passes.markRedeemed(SESSION, EXP);
  };
  return { deps, calls, extracts, locates, store, passes, state, steps, progress, redeemed };
}

const sending = (calls: string[]) => () => void calls.push('sending');

describe('the allowance', () => {
  it('a valid pass, or the free quota', () => {
    const { passes } = setUp();
    passes.saveQuota(QUOTA);
    expect(allowanceFor(passes, NOW)).toEqual({ stored: null, fields: { quota: QUOTA } });
    passes.savePass(pass());
    expect(allowanceFor(passes, NOW)).toEqual({
      stored: pass(),
      fields: { pass: pass().token },
    });
    passes.savePass(pass({ readsLeft: 0 }));
    expect(allowanceFor(passes, NOW).fields).toEqual({ quota: QUOTA });
  });
});

describe('sending a read', () => {
  it('a free read carries the quota and keeps the next quota token', async () => {
    const { deps, calls, extracts, passes } = setUp();
    passes.saveQuota(QUOTA);
    const outcome = await sendRead([image('a')], deps, sending(calls));
    expect(outcome).toEqual({ kind: 'read', result: read });
    expect(calls).toEqual(['captcha', 'sending', 'extract']);
    expect(extracts).toEqual([
      { files: [{ mediaType: 'image/jpeg', data: 'a' }], captchaToken: 'captcha', quota: QUOTA },
    ]);
    expect(passes.quota()).toBe('v1.quota.next');
  });

  it('a pass read carries the pass and keeps the reads it has left', async () => {
    const { deps, calls, extracts, passes } = setUp({
      extract: { ...read, allowance: null, readsLeft: 4 },
    });
    passes.saveQuota(QUOTA);
    passes.savePass(pass());
    await sendRead([image('a')], deps, sending(calls));
    expect(extracts[0]?.pass).toBe(pass().token);
    expect(extracts[0]).not.toHaveProperty('quota');
    expect(passes.pass()?.readsLeft).toBe(4);
    expect(passes.quota()).toBe(QUOTA);
  });

  it('a read that found nothing spends nothing', async () => {
    const pages = [{ page: 1, kind: 'other', readability: 'blurry' }] as const;
    const { deps, calls, store, passes } = setUp({
      extract: { ok: false, code: 'nothing_read', pages: [...pages] },
    });
    passes.saveQuota(QUOTA);
    passes.savePass(pass());
    const before = new Map(store.data);
    const outcome = await sendRead([image('a')], deps, sending(calls));
    expect(outcome).toEqual({ kind: 'nothing_read', pages });
    expect(store.data).toEqual(before);
  });

  it('a refused read settles the allowance and says so', async () => {
    const { deps, calls, passes } = setUp({ extract: { ok: false, code: 'pass_exhausted' } });
    passes.savePass(pass());
    const outcome = await sendRead([image('a')], deps, sending(calls));
    expect(outcome).toEqual({ kind: 'refused', code: 'pass_exhausted', renewed: false });
    expect(passes.pass()?.readsLeft).toBe(0);
  });

  it('without a captcha, nothing is sent', async () => {
    const { deps, calls } = setUp({ captchaFails: true });
    const outcome = await sendRead([image('a')], deps, sending(calls));
    expect(outcome).toEqual({ kind: 'captcha_unavailable' });
    expect(calls).toEqual(['captcha']);
  });

  it('once the person has left, a captcha that fails or arrives stops the read', async () => {
    for (const captchaFails of [true, false]) {
      const { deps, calls, state, steps } = setUp({ captchaFails });
      steps['captcha'] = () => void (state.current = false);
      const outcome = await sendRead([image('a')], deps, sending(calls));
      expect(outcome).toEqual({ kind: 'stopped' });
      expect(calls).toEqual(['captcha']);
    }
  });
});

describe('a refusal', () => {
  it('a refused pass is fetched again once, from the redeemed payment it came from', async () => {
    const renewedToken = passToken({ typ: 'pass', sid: SESSION, exp: EXP + 60 });
    const { deps, calls, passes, redeemed } = setUp({
      passAgain: { ok: true, pass: renewedToken, expiresAt: EXP + 60, readsLeft: 7 },
    });
    redeemed();
    passes.savePass(pass());
    expect(await settleRefusal('pass_invalid', pass(), deps)).toBe('renewed');
    expect(calls).toEqual([`pass ${SESSION}`]);
    expect(passes.pass()).toEqual({
      token: renewedToken,
      expiresAt: EXP + 60,
      readsLeft: 7,
      renewed: true,
    });
    expect(passes.checkouts()[0]?.expiresAt).toBe(EXP + 60);

    // The renewed pass is refused too: no second renewal, and it reads no more.
    const renewed = passes.pass() as StoredPass;
    expect(await settleRefusal('pass_invalid', renewed, deps)).toBe('failed');
    expect(calls).toEqual([`pass ${SESSION}`]);
    expect(passes.pass()?.usable).toBe(false);
  });

  it('a pass with no redeemed payment, or one given back the same, is retired', async () => {
    const pending = setUp();
    pending.passes.addCheckout({ nonce: NONCE, sessionId: SESSION });
    pending.passes.savePass(pass());
    expect(await settleRefusal('pass_invalid', pass(), pending.deps)).toBe('failed');
    expect(pending.calls).toEqual([]);
    expect(pending.passes.pass()?.usable).toBe(false);

    const same = setUp({
      passAgain: { ok: true, pass: pass().token, expiresAt: EXP, readsLeft: 9 },
    });
    same.redeemed();
    same.passes.savePass(pass());
    expect(await settleRefusal('pass_invalid', pass(), same.deps)).toBe('failed');
    expect(same.calls).toEqual([`pass ${SESSION}`]);
    expect(same.passes.pass()?.usable).toBe(false);
  });

  it('forgets a revoked or expired pass, and a refused quota token', async () => {
    for (const code of ['pass_revoked', 'pass_expired'] as const) {
      const { deps, passes } = setUp();
      passes.savePass(pass());
      expect(await settleRefusal(code, pass(), deps)).toBe('failed');
      expect(passes.pass()).toBeNull();
    }
    const free = setUp();
    free.passes.saveQuota(QUOTA);
    await settleRefusal('invalid_request', null, free.deps);
    expect(free.store.data.has(STORAGE_KEYS.quota)).toBe(false);

    // With a pass, the quota token was not what was refused.
    const paid = setUp();
    paid.passes.saveQuota(QUOTA);
    paid.passes.savePass(pass());
    await settleRefusal('invalid_request', pass(), paid.deps);
    expect(paid.passes.quota()).toBe(QUOTA);
    expect(paid.passes.pass()).toEqual(pass());
  });
});

describe('locating the pages of a long PDF', () => {
  it('takes the pages the locate step chose', async () => {
    const { deps, calls, locates, progress } = setUp();
    const pdf = fakePdf(30);
    expect(await locatePages(pdf.opened, 20, deps, sending(calls))).toEqual({
      kind: 'chosen',
      pages: [2, 5],
    });
    expect(pdf.rendered).toHaveLength(30);
    expect(calls).toEqual(['captcha', 'sending', 'locate']);
    expect(locates[0]).toMatchObject({ captchaToken: 'captcha', maxPages: 20, quota: null });
    expect(locates[0]?.files).toHaveLength(30);
    expect(progress).toEqual(['locating 1/30']);
  });

  it('falls back to the first pages when it can not choose', async () => {
    const failing = setUp({ locate: { ok: false, code: 'service_unavailable' } });
    expect(await locatePages(fakePdf(30).opened, 3, failing.deps, sending(failing.calls))).toEqual({
      kind: 'first',
      pages: [1, 2, 3],
    });

    // A page that won't draw in time: nothing is asked for.
    const slow = setUp();
    expect(await locatePages(fakePdf(30, [4]).opened, 3, slow.deps, sending(slow.calls))).toEqual({
      kind: 'first',
      pages: [1, 2, 3],
    });
    expect(slow.calls).toEqual([]);
  });

  it.each([...REFUSALS])('is refused, as the read would be, on %s', async (code: ErrorCode) => {
    const { deps, calls } = setUp({ locate: { ok: false, code } });
    const outcome = await locatePages(fakePdf(30).opened, 20, deps, sending(calls));
    expect(outcome).toEqual({ kind: 'refused', code, renewed: false });
  });

  it('without a captcha, nothing is sent', async () => {
    const { deps, calls } = setUp({ captchaFails: true });
    expect(await locatePages(fakePdf(30).opened, 20, deps, sending(calls))).toEqual({
      kind: 'captcha_unavailable',
    });
    expect(calls).toEqual(['captcha']);
  });

  it('stops, asking for nothing more, once the person has left', async () => {
    const drawing = setUp();
    const pdf = fakePdf(30);
    const render = pdf.opened.render;
    const leaving: OpenedPdf = {
      ...pdf.opened,
      render: async (n, ...rest) => {
        if (n === 3) drawing.state.current = false;
        return render(n, ...rest);
      },
    };
    expect(await locatePages(leaving, 20, drawing.deps, sending(drawing.calls))).toEqual({
      kind: 'stopped',
    });
    expect(pdf.rendered).toEqual([1, 2, 3]);
    expect(drawing.calls).toEqual([]);

    const asking = setUp();
    asking.steps['locate'] = () => void (asking.state.current = false);
    const outcome = await locatePages(fakePdf(30).opened, 20, asking.deps, sending(asking.calls));
    expect(outcome).toEqual({ kind: 'stopped' });
    expect(asking.calls).toEqual(['captcha', 'sending', 'locate']);
  });
});

describe('encoding the pages', () => {
  const photo = (name: string) => ({ file: new File(['x'], name) });

  it('keeps a PDF page once drawn and closes the document', async () => {
    const { deps, calls } = setUp();
    const pdf = fakePdf(2);
    const pages = [
      photo('a.jpg'),
      { file: new File(['2'], 'b.pdf'), pdf: { opened: pdf.opened, page: 2 } },
    ];
    const kept = new Map<(typeof pages)[number], EncodedFile>();
    const outcome = await encodeAll(pages, kept, deps);
    expect(outcome).toEqual({ kind: 'encoded', files: [image('a.jpg'), image('page 2')] });
    expect(calls).toEqual(['encode a.jpg']);
    expect([...kept.keys()]).toEqual([pages[1]]);
    expect(pdf.closed).toEqual([1]);
  });

  it('stops after the page being encoded once the person has left, and keeps the PDF open', async () => {
    const { deps, calls, state, steps } = setUp();
    const pdf = fakePdf(1);
    steps['encode a.jpg'] = () => {
      state.current = false;
    };
    const pages = [
      photo('a.jpg'),
      photo('b.jpg'),
      { file: new File(['1'], 'c.pdf'), pdf: { opened: pdf.opened, page: 1 } },
    ];
    expect(await encodeAll(pages, new Map(), deps)).toEqual({ kind: 'stopped' });
    expect(calls).toEqual(['encode a.jpg']);
    expect(pdf.closed).toEqual([]);
  });

  it('names the PDF that would not draw in time, and an image that would not encode', async () => {
    const { deps } = setUp();
    const pdf = fakePdf(1, [1]);
    expect(
      await encodeAll(
        [{ file: new File(['1'], 'b.pdf'), pdf: { opened: pdf.opened, page: 1 } }],
        new Map(),
        deps,
      ),
    ).toEqual({ kind: 'too_slow', pdf: pdf.opened });

    const broken = setUp();
    const failing: ReadingDeps<ExtractedFieldName, 'contracts'> = {
      ...broken.deps,
      encoder: { encode: () => Promise.reject(new Error('unreadable')) },
    };
    expect(await encodeAll([photo('a.jpg')], new Map(), failing)).toEqual({
      kind: 'failed',
      code: 'image_unreadable',
    });
    broken.state.current = false;
    expect(await encodeAll([photo('a.jpg')], new Map(), failing)).toEqual({ kind: 'stopped' });
  });
});
