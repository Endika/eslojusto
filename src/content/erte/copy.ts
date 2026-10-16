import type { ErteEstimate, ErteInput } from '../../engine/erte';
import type { ErteField } from '../../erte/form';

export interface ErteBlock {
  readonly title: string;
  readonly text: string;
  // The article that backs the block.
  readonly source: string;
}

export interface ErteView {
  readonly title: string;
  readonly lead: string;
  readonly blocks: readonly ErteBlock[];
}

type Options<V extends string> = readonly (readonly [V, string])[];

// Everything the ERTE page says, in one language: its file is src/content/erte/<lang>.ts.
export interface ErteCopy {
  readonly page: {
    readonly title: string;
    readonly description: string;
    readonly h1: string;
    readonly lead: string;
    readonly beta: string;
    readonly betaNote: string;
    readonly noJs: string;
    readonly button: string;
    readonly restart: string;
  };
  // The page's name in its breadcrumb.
  readonly crumb: string;
  // The paragraphs of the legal notice about the page.
  readonly legal: {
    readonly title: string;
    readonly does: string;
    readonly doesNot: string;
    readonly beta: string;
  };
  readonly questions: {
    readonly regime: {
      readonly question: string;
      readonly help: string;
      readonly options: Options<'etop' | 'force_majeure' | 'red' | 'unknown'>;
    };
    readonly measure: {
      readonly question: string;
      readonly options: Options<'suspension' | 'reduction'>;
    };
    readonly percent: { readonly label: string; readonly hint: string };
    readonly base: {
      readonly question: string;
      readonly label: string;
      readonly hint: string;
      readonly hintRed: string;
    };
    readonly children: {
      readonly question: string;
      readonly help: string;
      readonly options: Options<'0' | '1' | '2' | 'not_said'>;
    };
  };
  readonly errors: Readonly<Record<ErteField, string>>;
  readonly guide: {
    readonly title: string;
    readonly sheetTitle: string;
    readonly sheetLead: string;
    readonly nextTitle: string;
    readonly nextHub: string;
    readonly hubPath: string;
  };
  readonly faq: readonly { readonly question: string; readonly answer: string }[];
  readonly positiveView: (input: ErteInput, e: ErteEstimate) => ErteView;
  readonly unknownView: () => ErteView;
}
