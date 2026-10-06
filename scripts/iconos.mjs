// Draws public/favicon.svg and rasterises the PNG icons, favicon.ico and og.png with
// Playwright's Chromium. Run once with `node scripts/iconos.mjs` and commit the output.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const logo = JSON.parse(readFileSync('src/components/logo.json', 'utf8'));
const TINTA = '#16130f';
const SUELO = '#f6c700';
const TAPA = '#1c1a18';

// At 16 px the three lines turn to mush: two thick lines on a 2 px grid, and an ink rim so
// the white sheet still reads on a white tab strip.
const FAVICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect x="2" y="4" width="22" height="24" rx="3" fill="${TINTA}"/>
  <rect x="4" y="6" width="18" height="20" rx="1.5" fill="#fff"/>
  <path d="M24 6h3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3h-3z" fill="#e8571e"/>
  <path d="M7 10h11v4H7zM7 18h7v4H7z" fill="${TINTA}"/>
</svg>
`;
writeFileSync('public/favicon.svg', FAVICON);

const marca = (tam) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4 4 56 56" width="${tam}" height="${tam}">${logo.marca}</svg>`;

const { completo } = logo;
const ANCHO_LOCKUP = 860;
const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${completo.ancho} ${completo.alto}" width="${ANCHO_LOCKUP}">
  <g transform="${completo.marca}">${logo.marca}</g>
  <path d="${completo.palabra}" fill="${TINTA}"/><path d="${completo.dominio}" fill="${TINTA}"/>
</svg>`;

// The OG card is a divider: yellow ground, and the tab rail on the right edge with one tab per
// section, the current one flush with the ground.
const PESTANAS = [
  ['#e8571e', 5],
  [SUELO, 2],
  ['#3ba935', 5],
  ['#0f8f8f', 4],
  ['#2d3fd3', 5],
  ['#7a3fd1', 6],
];
const RIEL = 76;
const alturaUtil = 630 - 48 - 6 * (PESTANAS.length - 1);
const total = PESTANAS.reduce((s, [, p]) => s + p, 0);
let y = 24;
const riel = PESTANAS.map(([color, peso]) => {
  const alto = (alturaUtil * peso) / total;
  const actual = color === SUELO;
  const ancho = actual ? RIEL : RIEL - 16;
  const rect = `<path d="M0 ${y}h${ancho - 12}a12 12 0 0 1 12 12v${alto - 24}a12 12 0 0 1-12 12H0z" fill="${color}"/>`;
  y += alto + 6;
  return rect;
}).join('');
const og = `<div style="width:1200px;height:630px;display:flex;background:${TAPA}">
  <div style="flex:1;background:${SUELO};display:grid;place-items:center">${lockup}</div>
  <svg width="${RIEL}" height="630" viewBox="0 0 ${RIEL} 630">${riel}</svg>
</div>`;

const navegador = await chromium.launch();
async function captura(html, ancho, alto, ruta) {
  const pagina = await navegador.newPage({ viewport: { width: ancho, height: alto } });
  await pagina.setContent(
    `<!doctype html><style>html,body{margin:0;width:${ancho}px;height:${alto}px;overflow:hidden}body>*{display:block}</style>${html}`,
  );
  const png = await pagina.screenshot({ type: 'png', omitBackground: true });
  if (ruta) writeFileSync(ruta, png);
  await pagina.close();
  return png;
}

const favicon = (tam) => FAVICON.replace('<svg ', `<svg width="${tam}" height="${tam}" `);
const png16 = await captura(favicon(16), 16, 16);
const png32 = await captura(favicon(32), 32, 32, 'public/favicon-32.png');
await captura(
  `<div style="width:180px;height:180px;background:${SUELO};display:grid;place-items:center">${marca(132)}</div>`,
  180,
  180,
  'public/apple-touch-icon.png',
);
await captura(og, 1200, 630, 'public/og.png');
await navegador.close();

// An .ico that simply wraps the two PNGs.
const imagenes = [
  [16, png16],
  [32, png32],
];
const cabecera = Buffer.alloc(6 + 16 * imagenes.length);
cabecera.writeUInt16LE(0, 0);
cabecera.writeUInt16LE(1, 2);
cabecera.writeUInt16LE(imagenes.length, 4);
let desplazamiento = cabecera.length;
imagenes.forEach(([tam, png], i) => {
  const o = 6 + 16 * i;
  cabecera.writeUInt8(tam, o);
  cabecera.writeUInt8(tam, o + 1);
  cabecera.writeUInt16LE(1, o + 4);
  cabecera.writeUInt16LE(32, o + 6);
  cabecera.writeUInt32LE(png.length, o + 8);
  cabecera.writeUInt32LE(desplazamiento, o + 12);
  desplazamiento += png.length;
});
writeFileSync('public/favicon.ico', Buffer.concat([cabecera, ...imagenes.map(([, png]) => png)]));
console.log('favicon.svg, favicon.ico, favicon-32.png, apple-touch-icon.png, og.png');
