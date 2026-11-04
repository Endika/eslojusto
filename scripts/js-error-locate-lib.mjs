const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;
const FRAME = /^([\w.-]+\.m?js):(\d+):(\d+)$/;

export function parseFrame(text) {
  const m = FRAME.exec(text);
  if (!m) throw new Error(`Not a file:line:col frame: ${text}`);
  return { file: m[1], line: Number(m[2]), column: Number(m[3]) };
}

export function parseArgs(argv) {
  const [raw, ...frames] = argv;
  const version = raw?.replace(/^v/, '') ?? '';
  if (!SEMVER.test(version) || frames.length === 0)
    throw new Error('Usage: npm run js-error:locate -- <version> <file:line:col> [more frames…]');
  return { version, frames: frames.map(parseFrame) };
}

// Stack columns are 1-based; the source map's are 0-based. Paths in a map are relative to the
// chunk's folder, so what is left of the last `../` is the repo path.
export function repoPath(source) {
  return source.replace(/^(?:\.\.\/)+/, '');
}

export function contextLines(content, line, radius = 3) {
  const lines = content.split('\n');
  const from = Math.max(1, line - radius);
  const to = Math.min(lines.length, line + radius);
  const out = [];
  for (let n = from; n <= to; n++)
    out.push(`${n === line ? '>' : ' '} ${String(n).padStart(5)} | ${lines[n - 1]}`);
  return out;
}
