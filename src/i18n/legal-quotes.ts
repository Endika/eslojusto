// Passages of law and case law quoted word for word, shown only through <LegalQuote>. Each one
// appears verbatim among the `quotes` its source holds, read in the primary text; the copy test
// leaves them out because the law may use words the site never uses in its own voice.
export interface LegalQuoteText {
  // The id of the source it is quoted from.
  readonly source: string;
  readonly text: string;
}

export const LEGAL_QUOTES: Readonly<Record<string, LegalQuoteText>> = {};
