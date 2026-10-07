import type { DocumentFile, DocumentKind } from './documents';
import type { ResultCode } from './results';

export type ModelRead =
  | {
      readonly outcome: 'read';
      // The tool input exactly as the model produced it, or null if it produced none.
      readonly toolInput: unknown;
      readonly inputTokens: number;
      readonly outputTokens: number;
    }
  // The provider refused the document itself (corrupt, encrypted, unsupported).
  | { readonly outcome: 'rejected' };

// Throws when the model provider is unavailable.
export interface DocumentReader {
  read(request: {
    readonly model: string;
    readonly kind: DocumentKind;
    readonly files: readonly DocumentFile[];
  }): Promise<ModelRead>;
}

export interface PdfInspector {
  // null when the bytes are not a PDF it can open.
  countPages(bytes: Uint8Array): Promise<number | null>;
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
  readonly lineItems: readonly {
    readonly priceId: string | null;
    readonly unitAmount: number | null;
    readonly quantity: number | null;
  }[];
}

export interface PaymentVerifier {
  // null when no such session exists; throws when the provider is unavailable.
  findSession(sessionId: string): Promise<SessionSnapshot | null>;
}
