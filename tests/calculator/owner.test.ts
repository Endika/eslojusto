import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { es } from '../../src/i18n/es';

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });

describe("the owner's details", () => {
  it('live only in the dictionary', () => {
    const id = es['legal.owner_id'];
    expect(id).toMatch(/^\w{9}$/);
    for (const file of files('src').filter((f) => f !== join('src', 'i18n', 'es.ts')))
      expect(readFileSync(file, 'utf8'), file).not.toContain(id);
  });
});
