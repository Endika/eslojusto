// Outlines the wordmark to paths so the logo never depends on a font at runtime.
// Run once with `node scripts/logo.mjs` and commit src/components/logo.json.
import { readFileSync, writeFileSync } from 'node:fs';
import { create } from 'fontkit';
import { decompress } from 'wawoff2';

const fuente = async (ruta, ejes) =>
  create(Buffer.from(await decompress(readFileSync(ruta)))).getVariation(ejes);

const golos = await fuente(
  'node_modules/@fontsource-variable/golos-text/files/golos-text-latin-wght-normal.woff2',
  { wght: 800 },
);
const martian = await fuente(
  'node_modules/@fontsource-variable/martian-mono/files/martian-mono-latin-standard-normal.woff2',
  { wght: 600, wdth: 87.5 },
);

// The mark on a 64 grid: sheet, orange tab on the right edge, three lines of text.
const HOJA = { x: 6, y: 8, ancho: 44, alto: 48 };
const MARCA = [
  `<rect x="6" y="8" width="44" height="48" rx="3" fill="#fff"/>`,
  `<path class="logo__pestana" d="M50 12h4a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4h-4z" fill="#e8571e"/>`,
  `<path d="M14 18h22v6H14zM14 29h28v6H14zM14 40h16v6H14z" fill="#16130f"/>`,
].join('');
const DERECHA_MARCA = 58;

const r = (n) => Math.round(n * 100) / 100;

// Lays out `texto` at `tam` units per em from (x, base), with `tracking` in em, and returns
// one SVG path plus the ink box.
function trazar(fuenteVar, texto, { x, base, tam, tracking }) {
  const escala = tam / fuenteVar.unitsPerEm;
  const { glyphs, positions } = fuenteVar.layout(texto);
  let cursor = x - (glyphs[0]?.bbox.minX ?? 0) * escala;
  let d = '';
  let derecha = cursor;
  glyphs.forEach((g, i) => {
    const pos = positions[i];
    const ox = cursor + pos.xOffset * escala;
    const oy = base - pos.yOffset * escala;
    for (const c of g.path.commands) {
      const pts = [];
      for (let k = 0; k < c.args.length; k += 2)
        pts.push(`${r(ox + c.args[k] * escala)} ${r(oy - c.args[k + 1] * escala)}`);
      const letra = {
        moveTo: 'M',
        lineTo: 'L',
        quadraticCurveTo: 'Q',
        bezierCurveTo: 'C',
        closePath: 'Z',
      }[c.command];
      d += letra + pts.join(' ');
    }
    if (g.path.commands.length) derecha = Math.max(derecha, ox + g.bbox.maxX * escala);
    cursor += pos.xAdvance * escala + (i < glyphs.length - 1 ? tracking * tam : 0);
  });
  return { d, derecha };
}

// The sheet spans from the top of the ascenders down to `fondo` below the baseline.
function lockup({ fondo, dominio }) {
  const tam = 100;
  const asc = 70;
  const base = 74; // leaves room for the dot of the j above the ascender line
  const k = (asc + fondo) / HOJA.alto;
  const marca = `translate(${r(-HOJA.x * k)} ${r(base - asc - HOJA.y * k)}) scale(${r(k * 1000) / 1000})`;
  const inicio = (DERECHA_MARCA - HOJA.x) * k + 30;
  const palabra = trazar(golos, 'es lo justo', { x: inicio, base, tam, tracking: -0.02 });
  const salida = { marca, palabra: palabra.d, ancho: r(palabra.derecha), alto: r(base + fondo) };
  if (dominio) {
    const linea = trazar(martian, 'ESLOJUSTO.ES', {
      x: inicio + 1,
      base: base + fondo,
      tam: 22,
      tracking: 0.12,
    });
    salida.dominio = linea.d;
    salida.ancho = r(Math.max(palabra.derecha, linea.derecha));
  }
  return salida;
}

const logo = {
  marca: MARCA,
  compacto: lockup({ fondo: 21.4, dominio: false }),
  completo: lockup({ fondo: 50, dominio: true }),
};
writeFileSync('src/components/logo.json', `${JSON.stringify(logo, null, 2)}\n`);
console.log(
  'src/components/logo.json',
  logo.compacto.ancho,
  logo.compacto.alto,
  logo.completo.ancho,
  logo.completo.alto,
);
