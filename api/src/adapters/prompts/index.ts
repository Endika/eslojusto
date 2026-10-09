import type { ReviewKind } from '../../domain/reviews';
import { CREDIT_SYSTEM_PROMPT } from './credit';
import { EMPLOYMENT_SYSTEM_PROMPT } from './employment';
import { SYSTEM_PROMPT } from './final-pay';
import { INSURANCE_SYSTEM_PROMPT } from './insurance';
import { RENTAL_SYSTEM_PROMPT } from './rental';

// Each review's system prompt, in a module of its own.
export const SYSTEM_PROMPTS: Readonly<Record<ReviewKind, string>> = {
  final_pay: SYSTEM_PROMPT,
  rental: RENTAL_SYSTEM_PROMPT,
  employment: EMPLOYMENT_SYSTEM_PROMPT,
  credit: CREDIT_SYSTEM_PROMPT,
  insurance: INSURANCE_SYSTEM_PROMPT,
};
