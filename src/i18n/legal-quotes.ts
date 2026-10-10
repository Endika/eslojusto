// Passages of law and case law quoted word for word, shown only through <LegalQuote>. Each one
// appears verbatim among the `quotes` its source holds, read in the primary text; the copy test
// leaves them out because the law may use words the site never uses in its own voice.
export interface LegalQuoteText {
  // The id of the source it is quoted from.
  readonly source: string;
  readonly text: string;
}

export const LEGAL_QUOTES: Readonly<Record<string, LegalQuoteText>> = {
  mortgage_valuation_agency: {
    source: 'lcci_14',
    text: 'Los gastos de tasación del inmueble corresponderán a prestatario y los de gestoría al prestamista.',
  },
  mortgage_notary: {
    source: 'lcci_14',
    text: 'El prestamista asumirá el coste de los aranceles notariales de la escritura de préstamo hipotecario y los de las copias los asumirá quien las solicite.',
  },
  mortgage_registry: {
    source: 'lcci_14',
    text: 'Los gastos de inscripción de las garantías en el registro de la propiedad corresponderán al prestamista.',
  },
  mortgage_transparency_deed: {
    source: 'lcci_15',
    text: 'El acta donde conste la entrega y asesoramiento imparcial al prestatario no generará coste arancelario alguno.',
  },
  mortgage_floor: {
    source: 'lcci_21',
    text: 'En las operaciones con tipo de interés variable no se podrá fijar un límite a la baja del tipo de interés.',
  },
  mortgage_tax: {
    source: 'trlitpajd_29',
    text: 'Cuando se trate de escrituras de préstamo con garantía hipotecaria, se considerará sujeto pasivo al prestamista.',
  },
};
