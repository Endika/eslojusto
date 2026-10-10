import type { ReviewKind } from '../../domain/reviews';
import { CREDIT_SYSTEM_PROMPT } from './credit';
import { ELECTRICITY_SYSTEM_PROMPT } from './electricity';
import { EMPLOYMENT_SYSTEM_PROMPT } from './employment';
import { SYSTEM_PROMPT } from './final-pay';
import { INSURANCE_SYSTEM_PROMPT } from './insurance';
import { MORTGAGE_SYSTEM_PROMPT } from './mortgage';
import { RENTAL_SYSTEM_PROMPT } from './rental';
import { TELECOM_SYSTEM_PROMPT } from './telecom';

// Each review's system prompt, in a module of its own.
export const SYSTEM_PROMPTS: Readonly<Record<ReviewKind, string>> = {
  final_pay: SYSTEM_PROMPT,
  rental: RENTAL_SYSTEM_PROMPT,
  employment: EMPLOYMENT_SYSTEM_PROMPT,
  credit: CREDIT_SYSTEM_PROMPT,
  insurance: INSURANCE_SYSTEM_PROMPT,
  mortgage: MORTGAGE_SYSTEM_PROMPT,
  electricity: ELECTRICITY_SYSTEM_PROMPT,
  telecom: TELECOM_SYSTEM_PROMPT,
};
