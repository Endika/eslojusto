import type { Confidence } from '../documents/contract';
import type { ReadMark } from '../documents/ports';

// The answers a reading gives to a form, in order, and how surely each was read.
export class Answers<Field extends string> {
  readonly entries: [string, string][] = [];
  readonly marks: ReadMark[] = [];

  read(name: Field, value: string, confidence: Confidence, derived = false) {
    this.entries.push([name, value]);
    this.marks.push({
      id: name,
      container: `[data-field="${name}"]`,
      confidence,
      ...(derived && { derived: true as const }),
    });
  }

  // An answer that only opens what was read, such as «Sí» above the figure it asks for.
  open(name: Field, value: string) {
    this.entries.push([name, value]);
  }

  lowConfidence(): boolean {
    return this.marks.some((m) => m.confidence === 'low');
  }
}
