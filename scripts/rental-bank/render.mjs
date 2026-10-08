// Renders a synthetic bank of packs (by default the lease packs of api/eval/cases) to the JPEG
// photos a person would upload: each page as HTML, then a PNG, then spoiled in a <canvas> from a
// seeded PRNG. The same seed gives the same bytes, and the manifest's hash says so.
//   node scripts/rental-bank/render.mjs [--seed N] [--cases DIR --out DIR]
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = new URL('../../api/eval/', import.meta.url);
const TEMPLATES = new URL('templates/', ROOT);
const FOOTER = 'Documento ficticio · banco de pruebas';
const PLACEHOLDER = /\{\{(\w+)\}\}/g;
// A block repeated once per row of a list in the page data: {{#rows}}…{{/rows}}.
const SECTION = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
};
const dirArg = (name, fallback) => {
  const v = argOf(name);
  if (v === undefined) return fallback;
  if (v === '' || v.startsWith('--')) throw new Error(`${name} takes a directory`);
  return pathToFileURL(`${v.replace(/\/+$/, '')}/`);
};

const seedArg = argOf('--seed');
const SEED = seedArg === undefined ? 20261008 : Number(seedArg);
if (!Number.isInteger(SEED)) throw new Error('--seed takes an integer');
const CASES = dirArg('--cases', new URL('cases/', ROOT));
const OUT = dirArg('--out', new URL('out/', ROOT));

const escape = (v) =>
  String(v).replace(
    /[&<>"]/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch],
  );

function fill(html, data, where) {
  const expanded = html.replace(SECTION, (_, key, block) => {
    const rows = data[key];
    if (!Array.isArray(rows)) throw new Error(`${where}: {{#${key}}} needs a list`);
    return rows.map((row) => fill(block, { ...data, ...row }, where)).join('');
  });
  return expanded.replace(PLACEHOLDER, (_, key) => {
    if (!(key in data) || Array.isArray(data[key]))
      throw new Error(`${where}: no value for {{${key}}}`);
    return escape(data[key]);
  });
}

const STYLE = `
  body { margin: 0; background: #fff; color: #1d1d1d; font: 17px/1.5 'DejaVu Sans', sans-serif; }
  .page { box-sizing: border-box; width: 1000px; padding: 60px 80px 90px; position: relative; overflow: hidden; background: #fdfdfb; }
  h1 { font-size: 24px; margin: 0 0 18px; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; }
  td, th { border: 1px solid #888; padding: 8px 12px; text-align: left; }
  td.n { text-align: right; }
  .muted { color: #555; font-size: 15px; }
  .bank-footer { position: absolute; left: 0; right: 0; bottom: 28px; text-align: center; font-size: 13px; color: #666; }
`;

// One sheet of a document other than the lease, at its own height.
const sheet = (
  height,
  body,
  data,
  where,
) => `<!doctype html><html lang="es"><head><meta charset="utf-8" /><style>${STYLE}</style></head><body>
<section class="page" style="height:${height}px">${fill(body, data, where)}<footer class="bank-footer">${FOOTER}</footer></section></body></html>`;

const numbered = (data, prefix, fields) => {
  const rows = [];
  for (let i = 1; `${prefix}${i}${fields[0]}` in data; i++)
    rows.push(fields.map((f) => escape(data[`${prefix}${i}${f}`])));
  return rows;
};

const DOCUMENTS = {
  rent_update_notice: (data, where) =>
    sheet(
      1414,
      `<p class="muted">{{city}}, {{noticeOnText}}</p>
       <p>A la atención de {{tenantName}}</p>
       <h1>Comunicación de actualización de la renta</h1>
       <p>Por la presente le comunico que, conforme a la cláusula de actualización del contrato de arrendamiento, la renta mensual pasa de {{previousRent}} a {{newRent}}, lo que supone una variación del {{percent}}.</p>
       <p>La nueva renta se aplicará a partir del {{appliesFromText}}.</p>
       <p>Atentamente,</p>
       <p>{{landlordName}}</p>`,
      data,
      where,
    ),
  rent_receipt: (data, where) =>
    sheet(
      760,
      `<h1>Recibo de alquiler</h1>
       <p>Mes: {{monthText}}</p>
       <p class="muted">Recibí de {{tenantName}}, por transferencia desde la cuenta {{iban}}, los importes siguientes:</p>
       <table>
         <tr><td>Renta</td><td class="n">{{rent}}</td></tr>
         ${data.community === '' ? '' : '<tr><td>Gastos de comunidad</td><td class="n">{{community}}</td></tr>'}
         ${data.propertyTax === '' ? '' : '<tr><td>IBI</td><td class="n">{{propertyTax}}</td></tr>'}
         <tr><th>Total</th><th class="n">{{total}}</th></tr>
       </table>
       <p>Firmado: {{landlordName}}</p>`,
      data,
      where,
    ),
  agency_invoice: (data, where) =>
    sheet(
      900,
      `<h1>{{issuer}}</h1>
       <p>Factura n.º {{number}} · Fecha: {{issuedOnText}}</p>
       <p class="muted">Cliente: {{tenantName}}</p>
       <table>
         <tr><th>Concepto</th><th class="n">Importe</th></tr>
         <tr><td>{{concept}}</td><td class="n">{{base}}</td></tr>
         <tr><td>IVA 21 %</td><td class="n">{{vat}}</td></tr>
         <tr><th>Total</th><th class="n">{{total}}</th></tr>
       </table>`,
      data,
      where,
    ),
  deposit_return: (data, where) => {
    const returns = numbered(data, 'return', ['On', 'Amount'])
      .map(
        ([on, amount]) => `<tr><td>Transferencia del ${on}</td><td class="n">${amount}</td></tr>`,
      )
      .join('');
    const deductions = numbered(data, 'deduction', ['Concept', 'Amount'])
      .map(
        ([concept, amount]) =>
          `<tr><td>Descuento: ${concept}</td><td class="n">${amount}</td></tr>`,
      )
      .join('');
    return sheet(
      1100,
      `<h1>Liquidación de la fianza y entrega de llaves</h1>
       <p>La parte arrendataria, {{tenantName}}, entregó las llaves de la vivienda el {{keysText}}.</p>
       <p>Fianza depositada: {{deposit}}</p>
       <table>${returns}${deductions}</table>
       <p class="muted">Devoluciones a la cuenta {{iban}}.</p>
       <p>Firmado: {{landlordName}}</p>`,
      data,
      where,
    );
  },
  other: (data, where) => {
    const bodies = {
      supermarket: `<h1>Supermercado de Prueba</h1>
        <table><tr><td>Pan</td><td class="n">1,20 €</td></tr><tr><td>Leche (6 uds.)</td><td class="n">5,94 €</td></tr>
        <tr><td>Fruta</td><td class="n">3,45 €</td></tr><tr><th>Total</th><th class="n">10,59 €</th></tr></table>
        <p class="muted">Gracias por su compra. Ticket {{variant}}.</p>`,
      gym: `<h1>Gimnasio de Prueba</h1>
        <p>Cuota mensual de octubre: 34,90 €. Horario de lunes a sábado de 7:00 a 22:00.</p>
        <p class="muted">Folleto informativo ({{variant}}).</p>`,
    };
    const body = bodies[data.variant];
    if (body === undefined) throw new Error(`${where}: unknown variant ${data.variant}`);
    return sheet(900, body, data, where);
  },
};

function pageHtml(page, where) {
  if ('template' in page) {
    const html = readFileSync(new URL(`${page.template}.html`, TEMPLATES), 'utf8');
    return fill(html, page.data, where);
  }
  const draw = DOCUMENTS[page.kind];
  if (draw === undefined) throw new Error(`${where}: no drawing for kind ${page.kind}`);
  return draw(page.data, where);
}

// FNV-1a, so each image gets its own seed from the run's.
function seedOf(text) {
  let h = 0x811c9dc5;
  for (const ch of text) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

// Runs in the page: mulberry32 drives the shadow corner and the sensor noise.
async function degradeInCanvas({ png, d, seed }) {
  let a = seed;
  const random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const w = img.width;
  const h = Math.round(img.height * (1 - d.crop));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#5a4e44';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate((d.rotate * Math.PI) / 180);
  if (d.rotate !== 0) ctx.scale(0.95, 0.95);
  if (d.blur > 0) ctx.filter = `blur(${d.blur}px)`;
  ctx.drawImage(img, -img.width / 2, -h / 2);
  ctx.restore();
  ctx.filter = 'none';
  if (d.shadow > 0) {
    const corner = Math.floor(random() * 4);
    const [x0, y0] = [corner % 2 === 0 ? 0 : w, corner < 2 ? 0 : h];
    const g = ctx.createLinearGradient(x0, y0, w - x0, h - y0);
    g.addColorStop(0, `rgba(0,0,0,${d.shadow})`);
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (d.dark > 0) {
    ctx.fillStyle = `rgba(0,0,0,${d.dark})`;
    ctx.fillRect(0, 0, w, h);
  }
  const spoiled = d.rotate !== 0 || d.blur > 0 || d.shadow > 0 || d.dark > 0;
  if (spoiled) {
    const amplitude = 6 + 40 * d.dark;
    const pixels = ctx.getImageData(0, 0, w, h);
    const p = pixels.data;
    for (let i = 0; i < p.length; i += 4) {
      const n = (random() - 0.5) * amplitude;
      p[i] += n;
      p[i + 1] += n;
      p[i + 2] += n;
    }
    ctx.putImageData(pixels, 0, 0);
  }
  return canvas.toDataURL('image/jpeg', d.jpegQuality).split(',')[1];
}

const cases = readdirSync(CASES)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => JSON.parse(readFileSync(new URL(name, CASES), 'utf8')));

// A directory with a manifest of its own holds another bank's photos, and stays.
mkdirSync(OUT, { recursive: true });
for (const entry of readdirSync(OUT, { withFileTypes: true }).filter((e) => e.isDirectory()))
  if (!existsSync(new URL(`${entry.name}/manifest.json`, OUT)))
    rmSync(new URL(`${entry.name}/`, OUT), { recursive: true });

const browser = await chromium.launch();
const images = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 1414 },
    deviceScaleFactor: 1,
  });
  const doc = await context.newPage();
  const canvas = await context.newPage();
  await canvas.setContent('<!doctype html><html><body></body></html>');
  for (const c of cases) {
    const dir = new URL(`${c.id}/`, OUT);
    mkdirSync(dir, { recursive: true });
    let n = 0;
    for (const [p, page] of c.pages.entries()) {
      const where = `${c.id} page ${p + 1}`;
      await doc.setContent(pageHtml(page, where), { waitUntil: 'load' });
      const sheets = doc.locator('section.page');
      for (let s = 0; s < (await sheets.count()); s++) {
        const node = sheets.nth(s);
        if (!(await node.innerText()).includes(FOOTER))
          throw new Error(`${where}: sheet ${s + 1} lacks the footer`);
        n += 1;
        const png = (await node.screenshot({ type: 'png' })).toString('base64');
        const seed = seedOf(`${SEED}|${c.id}|${n}`);
        const jpeg = Buffer.from(
          await canvas.evaluate(degradeInCanvas, { png, d: page.degrade, seed }),
          'base64',
        );
        const file = `${c.id}/page-${String(n).padStart(2, '0')}.jpg`;
        writeFileSync(new URL(file, OUT), jpeg);
        images.push({ file, sha256: createHash('sha256').update(jpeg).digest('hex') });
      }
    }
  }
} finally {
  await browser.close();
}

const hash = createHash('sha256')
  .update(images.map((i) => `${i.file} ${i.sha256}`).join('\n'))
  .digest('hex');
writeFileSync(
  new URL('manifest.json', OUT),
  `${JSON.stringify({ seed: SEED, hash, images }, null, 2)}\n`,
);
console.log(`${cases.length} packs, ${images.length} images in ${fileURLToPath(OUT)}`);
console.log(`hash ${hash}`);
