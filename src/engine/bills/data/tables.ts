import type { BillsTables } from '../tables';
import { CHARGES } from './charges';
import { ELECTRICITY_TAX } from './electricity-tax';
import { SOCIAL_BONUS_FUNDING } from './fbs';
import { NATIONAL_HOLIDAYS } from './holidays';
import { METER_RENT } from './meter';
import { PVPC_MARGIN } from './pvpc';
import { SOCIAL_BONUS_CAPS, SOCIAL_BONUS_DISCOUNT } from './social-bonus';
import { TOLLS } from './tolls';
import { VAT } from './vat';

// Every table a review reads, as loaded in the repo; a composition root passes it in.
export const BILLS_TABLES: BillsTables = {
  tolls: TOLLS,
  charges: CHARGES,
  pvpcMargin: PVPC_MARGIN,
  socialBonusFunding: SOCIAL_BONUS_FUNDING,
  electricityTax: ELECTRICITY_TAX,
  vat: VAT,
  meter: METER_RENT,
  socialBonusDiscount: SOCIAL_BONUS_DISCOUNT,
  socialBonusCaps: SOCIAL_BONUS_CAPS,
  holidays: NATIONAL_HOLIDAYS,
};
