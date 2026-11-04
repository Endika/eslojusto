// Maps the frames of a js_error back to source:
//   npm run js-error:locate -- 1.113.0 main.Cz1.js:1:4521 render.B1.js:1:30
// Builds the release tag in a throwaway worktree, with source maps, once per version.
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SourceMapConsumer } from 'source-map-js';
import { contextLines, parseArgs, repoPath } from './js-error-locate-lib.mjs';

const root = resolve(fileURLToPath(import.meta.url), '../..');

function run(cmd, args, options = {}) {
  return execFileSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'inherit'],
    encoding: 'utf8',
    ...options,
  });
}

// The deploy build's variables change the chunks, so the same ones go into this build.
function deployEnv() {
  const env = { PUBLIC_RENEWAL: 'true', BUILD_SOURCEMAPS: '1' };
  try {
    const vars = JSON.parse(
      run('gh', ['variable', 'list', '-R', 'Endika/eslojusto', '--json', 'name,value']),
    );
    for (const { name, value } of vars) if (name.startsWith('PUBLIC_')) env[name] = value;
  } catch {
    console.error(
      'Could not read the repository variables: the build may differ from the deployed one.',
    );
  }
  return env;
}

// Tags older than the BUILD_SOURCEMAPS switch get the same through a wrapper config.
const WRAPPER = `import base from './astro.config.mjs';
export default {
  ...base,
  vite: { ...base.vite, build: { ...base.vite?.build, sourcemap: 'hidden' } },
};
`;

function build(version, cache) {
  const tag = `v${version}`;
  const dir = mkdtempSync(join(tmpdir(), `js-error-locate-${version}-`));
  const tree = join(dir, 'tree');
  try {
    run('git', ['worktree', 'add', '--detach', tree, tag], { cwd: root });
    symlinkSync(join(root, 'node_modules'), join(tree, 'node_modules'));
    run(
      'node',
      [
        '--input-type=module',
        '-e',
        `import('node:fs').then(f => f.writeFileSync('astro.locate.config.mjs', ${JSON.stringify(WRAPPER)}))`,
      ],
      { cwd: tree },
    );
    console.error(`Building ${tag} with source maps…`);
    run('npx', ['astro', 'build', '--config', 'astro.locate.config.mjs'], {
      cwd: tree,
      env: { ...process.env, ...deployEnv() },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    mkdirSync(cache, { recursive: true });
    cpSync(join(tree, 'dist', '_astro'), cache, { recursive: true });
  } finally {
    try {
      run('git', ['worktree', 'remove', '--force', tree], { cwd: root });
    } catch {
      rmSync(tree, { recursive: true, force: true });
      run('git', ['worktree', 'prune'], { cwd: root });
    }
    rmSync(dir, { recursive: true, force: true });
  }
}

function locate({ file, line, column }, cache) {
  const label = `${file}:${line}:${column}`;
  if (!existsSync(join(cache, file)))
    return `${label}\n  not found in this version's build: the build is not reproducible for it`;
  const mapPath = join(cache, `${file}.map`);
  if (!existsSync(mapPath)) return `${label}\n  no source map for this file`;
  const map = new SourceMapConsumer(JSON.parse(readFileSync(mapPath, 'utf8')));
  const pos = map.originalPositionFor({ line, column: column - 1 });
  if (!pos.source) return `${label}\n  no mapping at that position`;
  const where = `${repoPath(pos.source)}:${pos.line}:${pos.column + 1}`;
  const content = map.sourceContentFor(pos.source, true);
  const context = content ? `\n${contextLines(content, pos.line).join('\n')}` : '';
  return `${where}${pos.name ? ` (${pos.name})` : ''}${context}`;
}

try {
  const { version, frames } = parseArgs(process.argv.slice(2));
  const cache = join(root, 'node_modules', '.cache', 'js-error-locate', version);
  if (!existsSync(cache)) build(version, cache);
  console.log(frames.map((f) => locate(f, cache)).join('\n\n'));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
