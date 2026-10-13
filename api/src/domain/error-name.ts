// What a failure was, from a closed list of class names: an error's message can quote what was
// sent, so only its name is ever logged, and only a known one.
export const ERROR_NAMES = [
  'ThrottlingException',
  'ServiceUnavailableException',
  'ServiceQuotaExceededException',
  'InternalServerException',
  'ModelTimeoutException',
  'ModelNotReadyException',
  'ModelErrorException',
  'ValidationException',
  'AccessDeniedException',
  'ResourceNotFoundException',
  'TimeoutError',
  'AbortError',
  'TypeError',
  'RangeError',
  'SyntaxError',
] as const;
export type ErrorName = (typeof ERROR_NAMES)[number] | 'other';

export function errorName(error: unknown): ErrorName {
  const name = error instanceof Error ? error.name : '';
  return (ERROR_NAMES as readonly string[]).includes(name) ? (name as ErrorName) : 'other';
}
