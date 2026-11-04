import { describe, expect, it } from 'vitest';
import {
  contextLines,
  parseArgs,
  parseFrame,
  repoPath,
} from '../../scripts/js-error-locate-lib.mjs';

describe('js-error-locate', () => {
  it('reads a version and its frames', () => {
    expect(parseArgs(['v1.113.0', 'main.A-b.js:1:4521', 'x.mjs:2:3'])).toEqual({
      version: '1.113.0',
      frames: [
        { file: 'main.A-b.js', line: 1, column: 4521 },
        { file: 'x.mjs', line: 2, column: 3 },
      ],
    });
    expect(parseArgs(['1.2.3', 'a.js:1:1']).version).toBe('1.2.3');
  });

  it('refuses a missing frame or a version that is not semver', () => {
    expect(() => parseArgs(['1.113.0'])).toThrow(/Usage/);
    expect(() => parseArgs(['latest', 'a.js:1:1'])).toThrow(/Usage/);
    expect(() => parseArgs([])).toThrow(/Usage/);
  });

  it('refuses a frame without a column or with a path', () => {
    expect(() => parseFrame('main.js:12')).toThrow(/file:line:col/);
    expect(() => parseFrame('_astro/main.js:1:2')).toThrow(/file:line:col/);
  });

  it('turns a map path into a repo path', () => {
    expect(repoPath('../../src/calculator/flow.ts')).toBe('src/calculator/flow.ts');
    expect(repoPath('src/a.ts')).toBe('src/a.ts');
  });

  it('marks the line in its context', () => {
    const lines = contextLines('a\nb\nc\nd\ne\nf\ng\nh', 4);
    expect(lines).toHaveLength(7);
    expect(lines[3]).toBe('>     4 | d');
    expect(contextLines('a\nb', 1)).toEqual(['>     1 | a', '      2 | b']);
  });
});
