// Outlines the wordmark to paths so the logo never depends on a font at runtime.
// Run once with `node scripts/logo.mjs` and commit src/components/logo.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { create } from 'fontkit';
import { decompress } from 'wawoff2';

const loadFont = async (path, axes) =>
  create(Buffer.from(await decompress(readFileSync(path)))).getVariation(axes);

const golos = await loadFont(
  'node_modules/@fontsource-variable/golos-text/files/golos-text-latin-wght-normal.woff2',
  { wght: 800 },
);
const martian = await loadFont(
  'node_modules/@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2',
  { wght: 600, wdth: 87.5 },
);

// The mark on a 64 grid: sheet, orange tab on the right edge, three lines of text.
const SHEET = { x: 6, y: 8, width: 44, height: 48 };
const MARK = [
  `<rect x="6" y="8" width="44" height="48" rx="3" fill="#fff"/>`,
  `<path class="logo__tab" d="M50 12h4a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-4z" fill="#e8571e"/>`,
  `<path d="M14 18h22v6H14zM14 29h28v6H14zM14 40h16v6H14z" fill="#16130f"/>`,
].join('');
const MARK_RIGHT = 58;

const r = (n) => Math.round(n * 100) / 100;

// Lays out `text` at `size` units per em from (x, base), with `tracking` in em, and returns
// one SVG path plus the ink box.
function outline(font, text, { x, base, size, tracking }) {
  const scale = size / font.unitsPerEm;
  const { glyphs, positions } = font.layout(text);
  let cursor = x - (glyphs[0]?.bbox.minX ?? 0) * scale;
  let d = '';
  let right = cursor;
  glyphs.forEach((g, i) => {
    const pos = positions[i];
    const ox = cursor + pos.xOffset * scale;
    const oy = base - pos.yOffset * scale;
    for (const c of g.path.commands) {
      const pts = [];
      for (let k = 0; k < c.args.length; k += 2)
        pts.push(`${r(ox + c.args[k] * scale)} ${r(oy - c.args[k + 1] * scale)}`);
      const letter = {
        moveTo: 'M',
        lineTo: 'L',
        quadraticCurveTo: 'Q',
        bezierCurveTo: 'C',
        closePath: 'Z',
      }[c.command];
      d += letter + pts.join(' ');
    }
    if (g.path.commands.length) right = Math.max(right, ox + g.bbox.maxX * scale);
    cursor += pos.xAdvance * scale + (i < glyphs.length - 1 ? tracking * size : 0);
  });
  return { d, right };
}

// The sheet spans from the top of the ascenders down to `bottom` below the baseline.
function lockup({ bottom, domain }) {
  const size = 100;
  const asc = 70;
  const base = 74; // leaves room for the dot of the j above the ascender line
  const k = (asc + bottom) / SHEET.height;
  const mark = `translate(${r(-SHEET.x * k)} ${r(base - asc - SHEET.y * k)}) scale(${r(k * 1000) / 1000})`;
  const start = (MARK_RIGHT - SHEET.x) * k + 30;
  const wordmark = outline(golos, 'es lo justo', { x: start, base, size, tracking: -0.02 });
  const out = { mark, wordmark: wordmark.d, width: r(wordmark.right), height: r(base + bottom) };
  if (domain) {
    const line = outline(martian, 'ESLOJUSTO.ES', {
      x: start + 1,
      base: base + bottom,
      size: 22,
      tracking: 0.12,
    });
    out.domain = line.d;
    out.width = r(Math.max(wordmark.right, line.right));
  }
  return out;
}

const logo = {
  mark: MARK,
  compact: lockup({ bottom: 21.4, domain: false }),
  full: lockup({ bottom: 50, domain: true }),
};
writeFileSync('src/components/logo.json', `${JSON.stringify(logo, null, 2)}\n`);
console.log(
  'src/components/logo.json',
  logo.compact.width,
  logo.compact.height,
  logo.full.width,
  logo.full.height,
);
