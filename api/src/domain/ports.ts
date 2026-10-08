import type { DocumentFile } from './documents';
import type { Readability } from './extraction-schema';
import type { ResultCode } from './results';
import type { ReviewKind } from './reviews';

export interface ModelRead {
  // The tool input exactly as the model produced it, or null if it produced none.
  readonly toolInput: unknown;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

// Throws whenever the model provider does not answer, whatever the reason.
export interface DocumentReader {
  read(request: {
    readonly model: string;
    readonly review: ReviewKind;
    readonly files: readonly DocumentFile[];
    // Epoch milliseconds by which the read must be over, retries included, or abandoned.
    readonly deadline: number;
  }): Promise<ModelRead>;
}

export interface CaptchaVerifier {
  verify(token: string): Promise<boolean>;
}

export type Claims = Readonly<Record<string, string | number>>;

export interface TokenSigner {
  sign(claims: Claims): string;
  // The claims if the signature is valid, otherwise null.
  verify(token: string): unknown;
}

export interface Clock {
  // Epoch milliseconds.
  now(): number;
}

export type Operation = 'extract' | 'checkout' | 'pass';

// Closed on purpose: nothing a person sent or a document said can be logged.
export interface LogEvent {
  readonly op: Operation;
  readonly code: ResultCode;
  readonly latencyMs: number;
  readonly pages?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly escalated?: boolean;
  // How many fields two documents stated differently.
  readonly conflicts?: number;
  // Bedrock counted more than twice the input the pre-read estimate allowed for.
  readonly underestimated?: boolean;
  // A pass read went through but Stripe did not store its count.
  readonly countNotSaved?: boolean;
  // Pages per readability, when a read set any aside or found nothing: counts, never content.
  readonly readability?: Readonly<Partial<Record<Readability, number>>>;
  // The review an `extract` request named; none is the final pay's.
  readonly review?: ReviewKind;
  // A `pass` request that verified a pass rather than issued one.
  readonly verify?: boolean;
}

export interface Logger {
  log(event: LogEvent): void;
}

export interface CheckoutCreator {
  // Throws when the payment provider is unavailable. Stripe returns the person to the page of
  // the review they paid from.
  create(
    nonce: string,
    returnTo: ReviewKind,
  ): Promise<{ readonly sessionId: string; readonly url: string }>;
}

export interface SessionSnapshot {
  readonly id: string;
  readonly mode: string;
  readonly status: string | null;
  readonly paymentStatus: string;
  readonly currency: string | null;
  readonly clientReferenceId: string | null;
  // Epoch seconds.
  readonly created: number;
  readonly amountSubtotal: number | null;
  // Reads already made with this pass, as recorded in the session's metadata.
  readonly readsUsed: number;
  // Refunded or disputed.
  readonly revoked: boolean;
  readonly lineItems: readonly {
    readonly priceId: string | null;
    readonly unitAmount: number | null;
    readonly quantity: number | null;
  }[];
}

// Stripe is the only record of a pass: its session holds the read count.
export interface PaymentVerifier {
  // null when no such session exists; throws when the provider is unavailable.
  findSession(sessionId: string): Promise<SessionSnapshot | null>;
  // Throws when the provider is unavailable.
  recordReads(sessionId: string, readsUsed: number): Promise<void>;
}
