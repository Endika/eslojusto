import type { DocumentFile, DocumentKind } from '../../src/domain/documents';
import type {
  CaptchaVerifier,
  CheckoutCreator,
  Clock,
  DocumentReader,
  LogEvent,
  Logger,
  ModelRead,
  PaymentVerifier,
  SessionSnapshot,
} from '../../src/domain/ports';

export const PRIMARY = 'primary-model';
export const ESCALATION = 'escalation-model';

type Answer = ModelRead | Error;

export class FakeReader implements DocumentReader {
  readonly calls: { model: string; kind: DocumentKind; files: readonly DocumentFile[] }[] = [];
  constructor(private readonly answers: Readonly<Record<string, Answer>>) {}
  async read(request: { model: string; kind: DocumentKind; files: readonly DocumentFile[] }) {
    this.calls.push(request);
    const answer = this.answers[request.model];
    if (answer === undefined) throw new Error(`No answer for ${request.model}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

export const read = (toolInput: unknown, inputTokens = 1000, outputTokens = 200): ModelRead => ({
  outcome: 'read',
  toolInput,
  inputTokens,
  outputTokens,
});

export class FakeCaptcha implements CaptchaVerifier {
  readonly tokens: string[] = [];
  constructor(private readonly accept = true) {}
  async verify(token: string) {
    this.tokens.push(token);
    return this.accept;
  }
}

export class FakeClock implements Clock {
  constructor(public ms = Date.UTC(2026, 9, 7, 10, 0, 0)) {}
  now() {
    return this.ms;
  }
}

export class MemoryLogger implements Logger {
  readonly events: LogEvent[] = [];
  log(event: LogEvent) {
    this.events.push(event);
  }
}

export class FakeCheckout implements CheckoutCreator {
  readonly nonces: string[] = [];
  constructor(private readonly fail = false) {}
  async create(nonce: string) {
    this.nonces.push(nonce);
    if (this.fail) throw new Error('Stripe is down');
    return {
      sessionId: `cs_test_${nonce.replace(/[^A-Za-z0-9]/g, '')}`,
      url: 'https://checkout.stripe.com/c/pay/cs_test',
    };
  }
}

export class FakePayments implements PaymentVerifier {
  constructor(
    private readonly sessions: Readonly<Record<string, SessionSnapshot>>,
    private readonly fail = false,
  ) {}
  async findSession(id: string) {
    if (this.fail) throw new Error('Stripe is down');
    return this.sessions[id] ?? null;
  }
}
