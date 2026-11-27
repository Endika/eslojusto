// Splits the files to mutate into shards of similar size, for the mutation sweep's matrix.
// Usage: node stryker/shards.mjs <shards> <file>...   Prints [{"shard":1,"files":"a.ts,b.ts"},…].
import { statSync } from 'node:fs';

const [count, ...files] = process.argv.slice(2);
const shards = Array.from({ length: Math.min(Number(count), files.length) }, () => ({
  size: 0,
  files: [],
}));
const bySize = files
  .map((file) => ({ file, size: statSync(file).size }))
  .sort((a, b) => b.size - a.size);
for (const { file, size } of bySize) {
  const lightest = shards.reduce((a, b) => (b.size < a.size ? b : a));
  lightest.size += size;
  lightest.files.push(file);
}
console.log(JSON.stringify(shards.map((s, i) => ({ shard: i + 1, files: s.files.join(',') }))));
