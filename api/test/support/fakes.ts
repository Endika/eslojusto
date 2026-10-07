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
  readonly calls: Parameters<DocumentReader['read']>[0][] = [];
  constructor(
    private readonly answers: Readonly<Record<string, Answer>>,
    // Runs as each read starts, for a test that needs time to pass during it.
    private readonly during: () => void = () => {},
  ) {}
  async read(request: Parameters<DocumentReader['read']>[0]) {
    this.calls.push(request);
    this.during();
    const answer = this.answers[request.model];
    if (answer === undefined) throw new Error(`No answer for ${request.model}`);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

export const read = (toolInput: unknown, inputTokens = 1000, outputTokens = 200): ModelRead => ({
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
  readonly recorded: { sessionId: string; readsUsed: number }[] = [];
  constructor(
    private readonly sessions: Record<string, SessionSnapshot>,
    private readonly fail: 'find' | 'record' | null = null,
  ) {}
  async findSession(id: string) {
    if (this.fail === 'find') throw new Error('Stripe is down');
    return this.sessions[id] ?? null;
  }
  async recordReads(sessionId: string, readsUsed: number) {
    if (this.fail === 'record') throw new Error('Stripe is down');
    this.recorded.push({ sessionId, readsUsed });
    const session = this.sessions[sessionId];
    if (session) this.sessions[sessionId] = { ...session, readsUsed };
  }
}

export const NONCE = 'n0nce-generated-by-the-browser';
export const PRICE = 'price_test_pass';
export const CREATED = Date.UTC(2026, 9, 6, 12) / 1000;

// A finished, paid Checkout Session for the pass.
export const paidSession = (overrides: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  id: 'cs_test_paid',
  mode: 'payment',
  status: 'complete',
  paymentStatus: 'paid',
  currency: 'eur',
  clientReferenceId: NONCE,
  created: CREATED,
  amountSubtotal: 499,
  readsUsed: 0,
  revoked: false,
  lineItems: [{ priceId: PRICE, unitAmount: 499, quantity: 1 }],
  ...overrides,
});
