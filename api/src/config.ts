export const REGION = 'eu-south-2';
export const SITE_ORIGIN = 'https://eslojusto.es';
export const SITE_HOSTNAME = 'eslojusto.es';
export const CHECKOUT_SUCCESS_PATH = '/finiquito/';
export const CHECKOUT_CANCEL_PATH = '/finiquito/';

// EU geographic inference profiles, as listed by `aws bedrock list-inference-profiles --region eu-south-2`.
export const HAIKU_4_5 = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
export const SONNET_4_6 = 'eu.anthropic.claude-sonnet-4-6';
export const SONNET_5_5 = 'eu.anthropic.claude-sonnet-5-5';

// Every read is Sonnet 4.6 alone: equal constants turn escalation off. HAIKU_4_5 here brings back
// Haiku first and Sonnet for doubtful reads; the IAM scope follows whichever models these name.
export const PRIMARY_MODEL = SONNET_4_6;
// SONNET_5_5 once the account can invoke it.
export const ESCALATION_MODEL = SONNET_4_6;

export interface ModelSettings {
  // Sonnet 5.5 rejects tool_choice "tool" with a 400; it gets "auto" and the prompt names the tool.
  readonly forcedToolChoice: boolean;
  readonly maxTokens: number;
}

export const MODEL_SETTINGS: Readonly<Record<string, ModelSettings>> = {
  // A full pack records about 1,500 tokens and a long work history up to 4,000; the cap bounds the
  // cost of a read (api/README.md, «Cost»).
  [HAIKU_4_5]: { forcedToolChoice: true, maxTokens: 5000 },
  [SONNET_4_6]: { forcedToolChoice: true, maxTokens: 5000 },
  // Thinking is on by default on 5.5, so it needs room beyond the tool input.
  [SONNET_5_5]: { forcedToolChoice: false, maxTokens: 16000 },
};

// Where the EU profiles route requests from eu-south-2; IAM must allow the model in each.
export const EU_PROFILE_DESTINATIONS = [
  'eu-central-1',
  'eu-north-1',
  'eu-south-1',
  'eu-south-2',
  'eu-west-1',
  'eu-west-3',
] as const;

export const foundationModelId = (profileId: string): string => profileId.replace(/^eu\./, '');

export const PARAMETER_NAMES = {
  // A restricted key: Checkout Sessions write, PaymentIntents and Charges read.
  stripeRestrictedKey: '/eslojusto/api/stripe-restricted-key',
  tokenKey: '/eslojusto/api/token-hmac-key',
  turnstileSecretKey: '/eslojusto/api/turnstile-secret-key',
} as const;

export const FUNCTION_NAMES = {
  extract: 'eslojusto-api-extract',
  checkout: 'eslojusto-api-checkout',
  pass: 'eslojusto-api-pass',
} as const;

export const ROLE_NAMES = {
  extract: 'eslojusto-api-extract',
  checkout: 'eslojusto-api-checkout',
  pass: 'eslojusto-api-pass',
} as const;

export const STRIPE_PRICE_ENV = 'STRIPE_PRICE_ID';

// The extract function's timeout. Model reads stop well before it (src/domain/extract.ts), and
// the site waits 60 s longer, for the upload (src/documents/api.ts).
export const EXTRACT_TIMEOUT_SECONDS = 180;
