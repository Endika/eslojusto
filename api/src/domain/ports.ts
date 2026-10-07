import type { DocumentFile, DocumentKind } from './documents';
import type { ResultCode } from './results';

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
    readonly kind: DocumentKind;
    readonly files: readonly DocumentFile[];
  }): Promise<ModelRead>;
}

export interface PdfFacts {
  readonly pages: number;
  // Bytes of text the model would read from the PDF's text layer.
  readonly textBytes: number;
}

export interface PdfInspector {
  // null when the PDF can't be read unambiguously.
  inspect(bytes: Uint8Array): Promise<PdfFacts | null>;
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
}

export interface Logger {
  log(event: LogEvent): void;
}

export interface CheckoutCreator {
  // Throws when the payment provider is unavailable.
  create(nonce: string): Promise<{ readonly sessionId: string; readonly url: string }>;
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
