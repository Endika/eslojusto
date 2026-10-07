import type { EmploymentRuleId } from './rules';
import type { LiteralQuote } from './types';

type QuotedRule = Extract<
  EmploymentRuleId,
  | 'fixed_term_presumption'
  | 'replacement_name_cause'
  | 'permanent_on_breach'
  | 'chaining_18_in_24'
  | 'written_form'
>;

// Verbatim from the consolidated Estatuto in the BOE: art. 15 as worded from 02-01-2025 and
// art. 8.2 as worded from 27-06-2020. A new wording flagged by the monthly review means rereading
// these.
export const LAW_QUOTES: Readonly<Record<QuotedRule, LiteralQuote>> = {
  // 15.1, third paragraph.
  fixed_term_presumption: {
    text: 'Para que se entienda que concurre causa justificada de temporalidad será necesario que se especifiquen con precisión en el contrato la causa habilitante de la contratación temporal, las circunstancias concretas que la justifican y su conexión con la duración prevista.',
  },
  // 15.3, first paragraph.
  replacement_name_cause: {
    text: 'Podrán celebrarse contratos de duración determinada para la sustitución de una persona trabajadora con derecho a reserva de puesto de trabajo, siempre que se especifique en el contrato el nombre de la persona sustituida y la causa de la sustitución.',
  },
  // 15.4, first paragraph.
  permanent_on_breach: {
    text: 'Las personas contratadas incumpliendo lo establecido en este artículo adquirirán la condición de fijas.',
  },
  // 15.5, first paragraph, first sentence.
  chaining_18_in_24: {
    text: 'Sin perjuicio de lo anterior, las personas trabajadoras que en un periodo de veinticuatro meses hubieran estado contratadas durante un plazo superior a dieciocho meses, con o sin solución de continuidad, para el mismo o diferente puesto de trabajo con la misma empresa o grupo de empresas, mediante dos o más contratos por circunstancias de la producción, sea directamente o a través de su puesta a disposición por empresas de trabajo temporal, adquirirán la condición de personas trabajadoras fijas.',
  },
  // 8.2, third paragraph.
  written_form: {
    text: 'De no observarse la exigencia de forma escrita, el contrato de trabajo se presumirá celebrado por tiempo indefinido y a jornada completa, salvo prueba en contrario que acredite su naturaleza temporal o el carácter a tiempo parcial de los servicios.',
  },
};
