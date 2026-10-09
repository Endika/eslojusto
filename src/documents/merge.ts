import type { FormEntries } from '../calculator/fill';
import type { ReadMark, ReadPrefill } from './ports';

// How a list's rows are told apart: two rows are the same document's when they share at least
// one of these values and no other one of them differs.
export interface ListSpec {
  readonly identity: readonly string[];
  // The most rows the list holds.
  readonly max: number;
  // Where the mark of a whole row goes, for a list that marks rows rather than their fields.
  readonly rowContainer?: (row: number) => string;
}
export type ListSpecs = Readonly<Record<string, ListSpec>>;

// A value an earlier read put in the form, and whether it was worked out rather than read.
export interface Applied {
  readonly value: string;
  readonly derived: boolean;
}

export interface Merged {
  // What to set: every row already in a list the read touches, so none is lost, and the new
  // values.
  readonly entries: FormEntries;
  readonly marks: readonly ReadMark[];
  // The values this read put in the form, for the next read to know.
  readonly applied: readonly (readonly [string, Applied])[];
  // A value an earlier read gave that the read states otherwise, kept as it was and marked.
  readonly differ: boolean;
  // A value the person typed that the read states otherwise, kept as it was, with no mark.
  readonly typedDiffers: boolean;
  // A value an earlier read worked out, worked out again otherwise.
  readonly recalculated: boolean;
  // A list with no room left for every row read.
  readonly full: boolean;
}

const ROW = /^(\w+)\.(\d+)(?:\.(\w+))?$/;
type Row = Map<string, string>;

function sameDocument(identity: readonly string[], a: Row, b: Row): boolean {
  let shared = false;
  for (const key of identity) {
    const [x, y] = [a.get(key), b.get(key)];
    if (x === undefined || y === undefined) continue;
    if (x !== y) return false;
    shared = true;
  }
  return shared;
}

// What of the form is somebody's answer: what an earlier read put there, what the person changed,
// and every other value of a list row the person changed. A row typed with a list's first
// choice, which looks untouched, keeps that choice, so a read never takes it for another kind's
// row; a read row's value the read did not give stays open for a later read to give.
export function heldEntries(
  entries: FormEntries,
  applied: ReadonlyMap<string, Applied>,
  atDefault: (name: string, value: string) => boolean,
  lists: ListSpecs,
): FormEntries {
  const rowOf = (name: string) => {
    const m = ROW.exec(name);
    return m && m[3] !== undefined && lists[m[1] ?? ''] ? `${m[1]}.${m[2]}` : null;
  };
  const read = (name: string, value: string) => applied.get(name)?.value === value;
  const typed = (name: string, value: string) => !read(name, value) && !atDefault(name, value);
  const touched = new Set(entries.filter(([n, v]) => typed(n, v)).map(([name]) => rowOf(name)));
  return entries.filter(([name, value]) => {
    const row = rowOf(name);
    return read(name, value) || typed(name, value) || (row !== null && touched.has(row));
  });
}

const moved = (mark: ReadMark, id: string, container = mark.container): ReadMark => ({
  ...mark,
  id,
  container: container.split(`"${mark.id}"`).join(`"${id}"`),
});

// What a read puts into a form that may already hold earlier reads' answers. `current` holds the
// form's answers that are not its defaults; `applied`, what earlier reads put there.
//
// A value the form does not hold yet is set. One the form holds already is kept when the read
// states it otherwise and it was read as such, which is marked as differing, or typed, which
// is not.
// One an earlier read worked out is worked out again. An answer the read only opens a list with
// is always set. A row is added to its list unless the list holds the same document's row
// already, whose values are then taken one by one as above; a full list keeps its rows and takes
// no more.
export function mergeRead(
  read: Pick<ReadPrefill, 'entries' | 'marks'>,
  current: FormEntries,
  applied: ReadonlyMap<string, Applied>,
  lists: ListSpecs,
): Merged {
  const now = new Map(current);
  const marks = new Map(read.marks.map((m) => [m.id, m]));
  const entries = new Map<string, string>();
  const outMarks: ReadMark[] = [];
  const done: [string, Applied][] = [];
  let differ = false;
  let typedDiffers = false;
  let recalculated = false;
  let full = false;

  // Takes one value read for `target`: `set`, `kept` when the form keeps an earlier read's value,
  // `typed` when it keeps the person's.
  function take(target: string, value: string, mark: ReadMark | undefined) {
    const held = now.get(target);
    const earlier = applied.get(target);
    const fromRead = earlier !== undefined && earlier.value === held;
    if (mark && held !== undefined && held !== value && !(fromRead && earlier.derived)) {
      if (fromRead) differ = true;
      else typedDiffers = true;
      return fromRead ? 'kept' : 'typed';
    }
    if (mark && held !== undefined && held !== value) recalculated = true;
    entries.set(target, value);
    if (mark) done.push([target, { value, derived: mark.derived === true }]);
    return 'set';
  }

  const rowsOf = (entriesIn: FormEntries) => {
    const out = new Map<string, Map<number, Row>>();
    for (const [name, value] of entriesIn) {
      const m = ROW.exec(name);
      const [, list = '', i = '0', key] = m ?? [];
      if (!m || key === undefined || !lists[list]) continue;
      const rows = out.get(list) ?? new Map<number, Row>();
      const row = rows.get(Number(i)) ?? new Map<string, string>();
      row.set(key, value);
      rows.set(Number(i), row);
      out.set(list, rows);
    }
    return out;
  };
  const conflictMark = (mark: ReadMark): ReadMark => ({
    id: mark.id,
    container: mark.container,
    confidence: 'low',
    conflict: true,
  });

  for (const [name, value] of read.entries) {
    const m = ROW.exec(name);
    if (m && lists[m[1] ?? ''] && m[3] !== undefined) continue;
    const mark = marks.get(name);
    const taken = take(name, value, mark);
    if (mark && taken === 'set') outMarks.push(mark);
    if (mark && taken === 'kept') outMarks.push(conflictMark(mark));
  }

  const held = rowsOf(current);
  for (const [list, incoming] of rowsOf(read.entries)) {
    const spec = lists[list];
    if (!spec) continue;
    const rows = held.get(list) ?? new Map<number, Row>();
    for (const [i, row] of rows)
      for (const [key, value] of row) entries.set(`${list}.${i}.${key}`, value);
    let next = rows.size === 0 ? 0 : Math.max(...rows.keys()) + 1;
    const matched = new Set<number>();
    for (const i of [...incoming.keys()].sort((a, b) => a - b)) {
      const row = incoming.get(i) ?? new Map<string, string>();
      let k = [...rows.keys()].find(
        (j) => !matched.has(j) && sameDocument(spec.identity, rows.get(j) ?? new Map(), row),
      );
      if (k === undefined) {
        if (next >= spec.max) {
          full = true;
          continue;
        }
        k = next;
        next += 1;
      }
      matched.add(k);
      const rowMark = marks.get(`${list}.${i}`);
      const outcomes: string[] = [];
      for (const [key, value] of row) {
        const mark = marks.get(`${list}.${i}.${key}`);
        const target = `${list}.${k}.${key}`;
        const taken = take(target, value, mark ?? rowMark);
        outcomes.push(taken);
        if (!mark) continue;
        if (taken === 'set') outMarks.push(moved(mark, target));
        if (taken === 'kept') outMarks.push(conflictMark(moved(mark, target)));
      }
      if (rowMark) {
        const id = `${list}.${k}`;
        const at = moved(rowMark, id, spec.rowContainer?.(k) ?? rowMark.container);
        if (outcomes.includes('kept')) outMarks.push(conflictMark(at));
        else if (outcomes.includes('set')) outMarks.push(at);
      }
    }
  }

  // A mark about no value the read sets, as a section may give, goes as it came.
  const owned = new Set<string>();
  for (const [name] of read.entries) {
    owned.add(name);
    const m = ROW.exec(name);
    if (m && m[3] !== undefined && lists[m[1] ?? '']) owned.add(`${m[1]}.${m[2]}`);
  }
  return {
    entries: [...entries],
    marks: [...outMarks, ...read.marks.filter((m) => !owned.has(m.id))],
    applied: done,
    differ,
    typedDiffers,
    recalculated,
    full,
  };
}
