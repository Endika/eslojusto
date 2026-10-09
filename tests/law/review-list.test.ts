import { describe, expect, it } from 'vitest';
import { LAW_SECTIONS } from '../engine/law/registry';

// The list for the monthly legal review: every norm and source of every section, with its status,
// the day it was last read and where to read it. `npm run law:review` prints it.
describe.each(LAW_SECTIONS.map((s) => [s.name, s] as const))('%s', (_, section) => {
  it('lists its norms and sources with a link to read them', () => {
    const lines = [
      ...Object.values(section.norms).map(
        (n) =>
          `${n.id} · ${n.status} · since ${n.inForceSince} · read ${section.normReview?.[n.id] ?? '—'} · ${n.url}`,
      ),
      ...Object.values(section.sources).map(
        (s) =>
          `${s.id} · ${s.basis} · ${s.verified ? 'verified' : 'unverified'} · read ${s.lastVerified} · ${s.url}`,
      ),
    ];
    console.log([`${section.name}:`, ...lines.map((l) => `  ${l}`)].join('\n'));
    for (const url of [
      ...Object.values(section.norms).map((n) => n.url),
      ...Object.values(section.sources).map((s) => s.url),
    ])
      expect(url).toMatch(/^https:\/\//);
  });
});
