// Draws public/favicon.svg and rasterises the PNG icons, favicon.ico and og.png with
// Playwright's Chromium. Run once with `node scripts/icons.mjs` and commit the output.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const logo = JSON.parse(readFileSync('src/components/logo.json', 'utf8'));
const INK = '#16130f';
const GROUND = '#f6c700';
const COVER = '#1c1a18';

// At 16 px the three lines turn to mush: two thick lines on a 2 px grid, and an ink rim so
// the white sheet still reads on a white tab strip.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="2" y="4" width="22" height="24" rx="3" fill="${INK}"/>
  <rect x="4" y="6" width="18" height="20" rx="1.5" fill="#fff"/>
  <path d="M24 6h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-3z" fill="#e8571e"/>
  <path d="M7 10h11v4H7zM7 18h7v4H7z" fill="${INK}"/>
</svg>
`;
writeFileSync('public/favicon.svg', FAVICON);

const mark = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 56 56" width="${size}" height="${size}">${logo.mark}</svg>`;

const { full } = logo;
const LOCKUP_WIDTH = 860;
const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full.width} ${full.height}" width="${LOCKUP_WIDTH}">
  <g transform="${full.mark}">${logo.mark}</g>
  <path d="${full.wordmark}" fill="${INK}"/><path d="${full.domain}" fill="${INK}"/>
</svg>`;

// The OG card is a divider: yellow ground, and the tab rail on the right edge with one tab per
// section, the current one flush with the ground.
const TABS = [
  ['#e8571e', 5],
  [GROUND, 2],
  ['#3ba935', 5],
  ['#0f8f8f', 4],
  ['#2d3fd3', 5],
  ['#7a3fd1', 6],
];
const RAIL = 76;
const usableHeight = 630 - 48 - 6 * (TABS.length - 1);
const total = TABS.reduce((s, [, p]) => s + p, 0);
let y = 24;
const rail = TABS.map(([color, weight]) => {
  const height = (usableHeight * weight) / total;
  const current = color === GROUND;
  const width = current ? RAIL : RAIL - 16;
  const rect = `<path d="M0 ${y}h${width - 12}a12 12 0 0 1 12 12v${height - 24}a12 12 0 0 1-12 12H0z" fill="${color}"/>`;
  y += height + 6;
  return rect;
}).join('');
const og = `<div style="width:1200px;height:630px;display:flex;background:${COVER}">
  <div style="flex:1;background:${GROUND};display:grid;place-items:center">${lockup}</div>
  <svg width="${RAIL}" height="630" viewBox="0 0 ${RAIL} 630">${rail}</svg>
</div>`;

const browser = await chromium.launch();
async function capture(html, width, height, path) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<!doctype html><style>html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden}body>*{display:block}</style>${html}`,
  );
  const png = await page.screenshot({ type: 'png', omitBackground: true });
  if (path) writeFileSync(path, png);
  await page.close();
  return png;
}

const favicon = (size) => FAVICON.replace('<svg ', `<svg width="${size}" height="${size}" `);
const png16 = await capture(favicon(16), 16, 16);
const png32 = await capture(favicon(32), 32, 32, 'public/favicon-32.png');
await capture(
  `<div style="width:180px;height:180px;background:${GROUND};display:grid;place-items:center">${mark(132)}</div>`,
  180,
  180,
  'public/apple-touch-icon.png',
);
await capture(og, 1200, 630, 'public/og.png');
await browser.close();

// An .ico that simply wraps the two PNGs.
const images = [
  [16, png16],
  [32, png32],
];
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(([size, png], i) => {
  const o = 6 + 16 * i;
  header.writeUInt8(size, o);
  header.writeUInt8(size, o + 1);
  header.writeUInt16LE(1, o + 4);
  header.writeUInt16LE(32, o + 6);
  header.writeUInt32LE(png.length, o + 8);
  header.writeUInt32LE(offset, o + 12);
  offset += png.length;
});
writeFileSync('public/favicon.ico', Buffer.concat([header, ...images.map(([, png]) => png)]));
console.log('favicon.svg, favicon.ico, favicon-32.png, apple-touch-icon.png, og.png');
