// Marks a translation as made from today's Spanish, once it has been translated or checked.
//   npm run i18n:stamp -- eu              every key of src/i18n/eu.ts not stamped yet
//   npm run i18n:stamp -- eu --keys a,b   those keys again, after translating them anew
//   npm run i18n:stamp -- src/prose/eu/benefit.astro   a prose file or a copy module
import { readFileSync, writeFileSync } from 'node:fs';
import { es } from '../src/i18n/es.ts';
import { SOURCE_LINE, sourceHash } from './i18n-fidelity.ts';

const [target, flag, list] = process.argv.slice(2);
if (!target) throw new Error('Name a language or a file.');

if (target.includes('/')) {
  // src/prose/eu/x.astro → src/prose/es/x.astro; src/content/erte/eu.ts → src/content/erte/es.ts
  const spanish = target
    .replace(/\/[a-z]{2}\/([^/]+)$/, '/es/$1')
    .replace(/\/[a-z]{2}\.ts$/, '/es.ts');
  if (spanish === target) throw new Error(`No Spanish file for ${target}.`);
  const line = `// source: ${sourceHash(readFileSync(spanish, 'utf8'))}`;
  const text = readFileSync(target, 'utf8');
  const stamped = SOURCE_LINE.test(text)
    ? text.replace(SOURCE_LINE, line)
    : target.endsWith('.astro')
      ? text.replace(/^---\n/, `---\n${line}\n`)
      : `${line}\n${text}`;
  writeFileSync(target, stamped);
  console.log(`${target}: ${line}`);
} else {
  const lang = target;
  const { [lang]: translation } = await import(`../src/i18n/${lang}.ts`);
  const path = `src/i18n/sources/${lang}.json`;
  const sources = JSON.parse(readFileSync(path, 'utf8'));
  const keys =
    flag === '--keys'
      ? (list ?? '').split(',').filter(Boolean)
      : Object.keys(translation).filter((key) => !(key in sources));
  for (const key of keys) {
    if (!(key in translation)) throw new Error(`${key} is not translated in ${lang}.`);
    sources[key] = sourceHash(es[key]);
  }
  const ordered = Object.fromEntries(
    Object.keys(translation)
      .filter((k) => k in sources)
      .map((k) => [k, sources[k]]),
  );
  writeFileSync(path, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`${lang}: ${keys.length} stamped, ${Object.keys(ordered).length} in all`);
}
