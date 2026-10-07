import { createHash } from 'node:crypto';

// A key for the verify memo that keeps no token in memory.
export const tokenHash = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
