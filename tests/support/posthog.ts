import { gunzipSync } from 'node:zlib';
import type { Page, Request } from '@playwright/test';

const POSTHOG = 'https://eu.i.posthog.com';

export interface Captured {
  event: string;
  properties: Record<string, unknown>;
}

function decode(r: Request): string {
  const body = r.postDataBuffer();
  if (!body) return '';
  const compression = new URL(r.url()).searchParams.get('compression');
  if (compression === 'gzip-js' || (body[0] === 0x1f && body[1] === 0x8b))
    return gunzipSync(body).toString('utf8');
  const raw = body.toString('utf8');
  if (compression === 'base64' || raw.startsWith('data=')) {
    const data = new URLSearchParams(raw).get('data') ?? '';
    return Buffer.from(data, 'base64').toString('utf8');
  }
  return raw;
}

function eventsIn(body: string): Captured[] {
  if (!body) return [];
  const json: unknown = JSON.parse(body);
  const list = Array.isArray(json)
    ? json
    : json && typeof json === 'object' && 'batch' in json && Array.isArray(json.batch)
      ? json.batch
      : [json];
  return list as Captured[];
}

// Answers every request to PostHog and keeps what it carried, for a build with a test analytics
// key. Call it before the page opens.
export async function capturePosthog(page: Page): Promise<{
  // Every request body, decoded, as sent.
  readonly bodies: readonly string[];
  // The events sent under a name, in order.
  named(event: string): readonly Captured[];
}> {
  await page.addInitScript(() => {
    // PostHog drops events from automated browsers; the page must look like a person's.
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    // Playwright cannot route a beacon, which PostHog uses on pagehide; a fetch it can.
    navigator.sendBeacon = (url, data) => {
      void fetch(url, { method: 'POST', body: data ?? null });
      return true;
    };
  });
  const bodies: string[] = [];
  await page.route(`${POSTHOG}/**`, async (route) => {
    bodies.push(decode(route.request()));
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":1}' });
  });
  return {
    bodies,
    named: (event) => bodies.flatMap(eventsIn).filter((e) => e.event === event),
  };
}
