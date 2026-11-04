import type { RENEWAL_PAGE_KINDS } from '../src/domain/documents';
import type { ELECTRICITY_READABILITY } from '../src/domain/electricity-schema';
import type { Degrade, ExpectedExtraction, PageData } from './schema';

// One synthetic renewal letter: the page to render and what a read should find in it. Every value
// is invented; the letter's figures follow a real one's, with no name, address or supply code.

// Each template and the kind of document it should be read as.
export const RENEWAL_TEMPLATES = {
  'renewal/letter-es': 'price_change_notice',
} as const satisfies Readonly<Record<string, (typeof RENEWAL_PAGE_KINDS)[number]>>;
export type RenewalTemplateId = keyof typeof RENEWAL_TEMPLATES;
export const RENEWAL_TEMPLATE_IDS = Object.keys(RENEWAL_TEMPLATES) as readonly RenewalTemplateId[];

export interface RenewalPageSpec {
  readonly template: RenewalTemplateId;
  readonly data: PageData;
  readonly degrade: Degrade;
  readonly readability?: (typeof ELECTRICITY_READABILITY)[number];
}

// Page data keys that hold a person's data: never to be transcribed by a read.
export const RENEWAL_PERSON_KEYS = ['holderName', 'holderAddress', 'cups'] as const;

export interface RenewalBankCase {
  readonly id: string;
  readonly description: string;
  readonly eval: boolean;
  readonly pages: readonly RenewalPageSpec[];
  readonly expected: { readonly extraction: ExpectedExtraction };
}

export const renewalPageKind = (page: RenewalPageSpec): string => RENEWAL_TEMPLATES[page.template];
