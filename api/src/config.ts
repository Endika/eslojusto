export const REGION = 'eu-south-2';
export const SITE_ORIGIN = 'https://eslojusto.es';
export const SITE_HOSTNAME = 'eslojusto.es';
export const CHECKOUT_SUCCESS_PATH = '/finiquito/';
export const CHECKOUT_CANCEL_PATH = '/finiquito/';

// EU geographic inference profiles, as listed by `aws bedrock list-inference-profiles --region eu-south-2`.
export const HAIKU_4_5 = 'eu.anthropic.claude-haiku-4-5-20251001-v1:0';
export const SONNET_4_6 = 'eu.anthropic.claude-sonnet-4-6';
export const SONNET_5_5 = 'eu.anthropic.claude-sonnet-5-5';

export const PRIMARY_MODEL = HAIKU_4_5;
// SONNET_5_5 once the account can invoke it.
export const ESCALATION_MODEL = SONNET_4_6;

export interface ModelSettings {
  // Sonnet 5.5 rejects tool_choice "tool" with a 400; it gets "auto" and the prompt names the tool.
  readonly forcedToolChoice: boolean;
  readonly maxTokens: number;
}

export const MODEL_SETTINGS: Readonly<Record<string, ModelSettings>> = {
  [HAIKU_4_5]: { forcedToolChoice: true, maxTokens: 4096 },
  [SONNET_4_6]: { forcedToolChoice: true, maxTokens: 4096 },
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
  stripeSecretKey: '/eslojusto/api/stripe-secret-key',
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
