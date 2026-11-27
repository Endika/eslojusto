// Merges the shards' Stryker JSON reports into one. Test and mutant ids are per run, so they are
// renumbered: a test is the same test in every shard when its file, name and line match.
// Usage: node stryker/merge.mjs <out.json> <shard.json>...
import { readFileSync, writeFileSync } from 'node:fs';

const [out, ...inputs] = process.argv.slice(2);
const merged = { files: {}, testFiles: {} };
const testIds = new Map();
let mutantId = 0;

for (const input of inputs) {
  const report = JSON.parse(readFileSync(input, 'utf8'));
  const { files, testFiles, ...rest } = report;
  Object.assign(merged, rest, { files: merged.files, testFiles: merged.testFiles });
  const local = new Map();
  for (const [path, testFile] of Object.entries(testFiles ?? {})) {
    const target = (merged.testFiles[path] ??= { ...testFile, tests: [] });
    for (const test of testFile.tests) {
      const key = `${path}\u0000${test.name}\u0000${test.location?.start.line}`;
      if (!testIds.has(key)) {
        testIds.set(key, String(testIds.size));
        target.tests.push({ ...test, id: testIds.get(key) });
      }
      local.set(test.id, testIds.get(key));
    }
  }
  const remap = (ids) => ids?.map((id) => local.get(id) ?? id);
  for (const [path, file] of Object.entries(files)) {
    merged.files[path] = {
      ...file,
      mutants: file.mutants.map((m) => ({
        ...m,
        id: String(mutantId++),
        coveredBy: remap(m.coveredBy),
        killedBy: remap(m.killedBy),
      })),
    };
  }
}

writeFileSync(out, JSON.stringify(merged));
const totals = {};
for (const file of Object.values(merged.files))
  for (const m of file.mutants) totals[m.status] = (totals[m.status] ?? 0) + 1;
console.log(JSON.stringify(totals));
