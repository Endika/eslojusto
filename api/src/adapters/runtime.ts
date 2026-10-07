import type { Clock, Logger } from '../domain/ports';

export const systemClock: Clock = { now: () => Date.now() };

export const consoleLogger: Logger = {
  log: (event) => console.log(JSON.stringify(event)),
};
