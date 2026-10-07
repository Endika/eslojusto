import type { CivilDate } from '../engine/date';

export function localToday(): CivilDate {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}
