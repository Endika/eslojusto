import type { Key } from './es';

// A language's dictionary while it is being translated: the keys done so far. The missing ones
// read in Spanish, which only an unpublished language may do; a test holds a published one to
// every key.
export type Translation = Readonly<Partial<Record<Key, string>>>;
