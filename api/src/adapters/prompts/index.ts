import type { ReviewKind } from '../../domain/reviews';
import { EMPLOYMENT_SYSTEM_PROMPT } from './employment';
import { SYSTEM_PROMPT } from './final-pay';
import { RENTAL_SYSTEM_PROMPT } from './rental';

// Each review's system prompt, in a module of its own.
export const SYSTEM_PROMPTS: Readonly<Record<ReviewKind, string>> = {
  final_pay: SYSTEM_PROMPT,
  rental: RENTAL_SYSTEM_PROMPT,
  employment: EMPLOYMENT_SYSTEM_PROMPT,
};
