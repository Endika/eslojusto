import type { Key } from '../i18n';
import { link, type Lang } from '../i18n/languages';
import {
  BILLS_BETA,
  CREDIT_BETA,
  EMPLOYMENT_BETA,
  HOUSEHOLD_BETA,
  INSURANCE_BETA,
  MORTGAGE_BETA,
  RENTAL_BETA,
} from './sections';

export interface Review {
  id: string;
  name: Key;
  href: string;
  situation: Key;
  citation: Key;
  beta: boolean;
}

export interface ReviewGroup {
  id: string;
  tone: string;
  label: Key;
  sections: Review[];
  more?: { href: string; label: Key };
}

export const reviewGroups = (lang: Lang): ReviewGroup[] => [
  {
    id: 'work',
    tone: 'cause',
    label: 'home.group_work',
    sections: [
      {
        id: 'final-pay',
        name: 'home.final_pay',
        href: link(lang, 'finiquito/'),
        situation: 'home.final_pay_situation',
        citation: 'home.final_pay_citation',
        beta: false,
      },
      {
        id: 'benefit',
        name: 'home.benefit',
        href: link(lang, 'paro/'),
        situation: 'home.benefit_situation',
        citation: 'home.benefit_citation',
        beta: false,
      },
      {
        id: 'employment',
        name: 'home.contract',
        href: link(lang, 'contrato/'),
        situation: 'home.contract_situation',
        citation: 'home.contract_citation',
        beta: EMPLOYMENT_BETA,
      },
      {
        id: 'household',
        name: 'home.household',
        href: link(lang, 'empleada-de-hogar/'),
        situation: 'home.household_situation',
        citation: 'home.household_citation',
        beta: HOUSEHOLD_BETA,
      },
    ],
  },
  {
    id: 'housing',
    tone: 'settlement',
    label: 'home.group_housing',
    sections: [
      {
        id: 'rental',
        name: 'home.rent',
        href: link(lang, 'alquiler/'),
        situation: 'home.rent_situation',
        citation: 'home.rent_citation',
        beta: RENTAL_BETA,
      },
      {
        id: 'mortgage',
        name: 'home.mortgage',
        href: link(lang, 'hipoteca/'),
        situation: 'home.mortgage_situation',
        citation: 'home.mortgage_citation',
        beta: MORTGAGE_BETA,
      },
    ],
    more: { href: link(lang, 'alquiler/irav-ipc/'), label: 'home.rent_indices' },
  },
  {
    id: 'money',
    tone: 'salary',
    label: 'home.group_money',
    sections: [
      {
        id: 'insurance',
        name: 'home.insurance',
        href: link(lang, 'seguros/'),
        situation: 'home.insurance_situation',
        citation: 'home.insurance_citation',
        beta: INSURANCE_BETA,
      },
      {
        id: 'credit',
        name: 'home.credit',
        href: link(lang, 'financiacion/'),
        situation: 'home.credit_situation',
        citation: 'home.credit_citation',
        beta: CREDIT_BETA,
      },
      {
        id: 'bills',
        name: 'home.bills',
        href: link(lang, 'facturas/'),
        situation: 'home.bills_situation',
        citation: 'home.bills_citation',
        beta: BILLS_BETA,
      },
    ],
  },
];
