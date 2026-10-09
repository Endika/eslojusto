// @vitest-environment happy-dom
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGS } from '../../src/i18n/languages';

const built = existsSync('dist/index.html');

// Every page of the build by its path from the site root: whatever the switches put in it, a new
// page joins the check without touching this test.
const pages = (dir = 'dist', path = '/'): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return pages(`${dir}/${entry.name}`, `${path}${entry.name}/`);
    return entry.name === 'index.html' ? [path] : [];
  });
// The home in each language; every other page sits below one.
const homes = new Set(['/', ...Object.keys(LANGS).map((lang) => `/${lang}/`)]);

const parse = (path: string) =>
  new DOMParser().parseFromString(readFileSync(`dist${path}index.html`, 'utf8'), 'text/html');

interface ListItem {
  '@type': string;
  position: number;
  name: string;
  item: string;
}
const breadcrumbLists = (doc: Document) =>
  [...doc.querySelectorAll('script[type="application/ld+json"]')]
    .flatMap((script) => {
      const data = JSON.parse(script.textContent ?? '{}') as { '@graph'?: object[] };
      return data['@graph'] ?? [data];
    })
    .filter((node) => (node as { '@type'?: string })['@type'] === 'BreadcrumbList') as {
    itemListElement: ListItem[];
  }[];

// The visible trail: each crumb's name and the path it leads to (the page's own, for the last).
const visibleTrail = (doc: Document, path: string) =>
  [...doc.querySelectorAll('nav.crumbs li')].map((li, i, all) => {
    const name = li.textContent?.trim() ?? '';
    const last = i === all.length - 1;
    const anchor = li.querySelector('a');
    expect(Boolean(anchor), `${path}: crumb «${name}» is a link only if it is not the last`).toBe(
      !last,
    );
    if (last) expect(li.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe(name);
    return { name, path: anchor?.getAttribute('href') ?? path };
  });

describe.skipIf(!built)('the breadcrumbs of the build', () => {
  const all = pages();
  const below = all.filter((path) => !homes.has(path));

  it('leave the home without a trail', () => {
    for (const path of all.filter((p) => homes.has(p))) {
      const doc = parse(path);
      expect(doc.querySelectorAll('nav.crumbs'), path).toHaveLength(0);
      expect(breadcrumbLists(doc), path).toHaveLength(0);
    }
  });

  it('show the trail on every page below the home and declare the same one', () => {
    expect(below.length).toBeGreaterThan(0);
    for (const path of below) {
      const doc = parse(path);
      expect(doc.querySelectorAll('main nav.crumbs'), `${path}: one visible trail`).toHaveLength(1);
      const shown = visibleTrail(doc, path);
      expect(shown.length, `${path}: home and the page at least`).toBeGreaterThanOrEqual(2);
      expect(homes.has(shown[0]?.path ?? ''), `${path}: starts at the home`).toBe(true);
      expect(shown.at(-1)?.path, `${path}: ends on the page itself`).toBe(path);

      const lists = breadcrumbLists(doc);
      expect(lists, `${path}: one BreadcrumbList`).toHaveLength(1);
      const declared = (lists[0]?.itemListElement ?? []).map(({ position, name, item }) => ({
        position,
        name,
        path: new URL(item).pathname,
      }));
      expect(declared, `${path}: the JSON-LD matches the visible trail`).toEqual(
        shown.map((crumb, i) => ({ position: i + 1, ...crumb })),
      );
      const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
      if (canonical) expect(lists[0]?.itemListElement.at(-1)?.item).toBe(canonical);
    }
  });
});
