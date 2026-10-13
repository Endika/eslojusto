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
  bills_change_notice: {
    source: 'rd88_6',
    text: 'Ser avisado de forma transparente y comprensible por su comercializador o agregador independiente, con al menos un mes de antelación, por escrito y de manera separada a su factura, de cualquier intención de modificar las condiciones del contrato e informado de su derecho a rescindir el contrato sin coste alguno cuando reciba el aviso.',
  },
  bills_commitment_proportional: {
    source: 'trlgdcu_62',
    text: 'En caso de que el usuario incumpla el compromiso de permanencia adquirido con la empresa, la penalización por baja o cese prematuro de la relación contractual, será proporcional al número de días no efectivos del compromiso de permanencia acordado.',
  },
  bills_after_exit: {
    source: 'rd899_7',
    text: 'El operador se abstendrá de facturar y cobrar cualquier cantidad que se haya podido devengar, por causa no imputable al usuario final, con posterioridad al plazo de dos días en que debió surtir efectos la baja.',
  },
};
