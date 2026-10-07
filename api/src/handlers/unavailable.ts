import { consoleLogger, systemClock } from '../adapters/runtime';
import { handle, type HttpEvent, type HttpResponse } from '../http/common';
import type { Operation } from '../domain/ports';

export const unavailable = (op: Operation, event: HttpEvent): Promise<HttpResponse> =>
  handle(op, event, { logger: consoleLogger, clock: systemClock }, async () => ({
    code: 'service_unavailable',
  }));
