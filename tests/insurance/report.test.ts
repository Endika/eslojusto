import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { INSURANCE_NORMS } from '../../src/engine/insurance/data/norms';
import { reviewInsurance } from '../../src/engine/insurance/review';
import type { InsuranceInput } from '../../src/engine/insurance/types';
import type { Block } from '../../src/documents/ports';
import type { Translate } from '../../src/i18n/client';
import { insuranceReport } from '../../src/insurance/report';
import { notice, policy, TODAY } from '../engine/insurance/input';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('insurance');

const reportOf = (input: InsuranceInput) => {
  const r = reviewInsurance(input, TODAY, { norms: INSURANCE_NORMS });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return insuranceReport({ input, review: r.review }, tr, parseDate('2026-10-20'));
};

const shape = (b: Block): string => plain(shapeOf(b));
const plain = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ');
const shapeOf = (b: Block): string => {
  if ('label' in b) return `${b.type}:${b.label}=${'value' in b ? b.value : ''}`;
  const text = 'text' in b ? b.text : '';
  return `${b.type}:${b.type === 'text' || b.type === 'bullet' || b.type === 'source' ? text.slice(0, 28) : text}`;
};

const dataSection = (input: InsuranceInput) => {
  const shapes = reportOf(input).blocks.map(shape);
  return shapes.slice(
    shapes.indexOf('heading:Tus datos') + 1,
    shapes.indexOf('heading:Fecha por fecha'),
  );
};

describe('the insurance report', () => {
  it('lays out a policy sold at a distance with its notice, finding by finding', () => {
    const model = reportOf(
      policy({ distance: true, concludedOn: parseDate('2026-10-05'), notice: notice() }),
    );
    expect(model.title).toBe('Revisión de las fechas de tu seguro');
    expect(model.footer).toContain('20 de octubre de 2026');
    expect(model.blocks.map(shape)).toEqual([
      'title:Revisión de las fechas de tu seguro',
      'meta:eslojusto.es · 20 de octubre de 2026',
      'rule:',
      'text:Este informe recoge las fech',
      'heading:Tus datos',
      'row:Tipo de seguro=Hogar',
      'row:Vencimiento del periodo en curso=01-03-2027',
      'row:Se renueva sola=Sí',
      'row:Contratada a distancia=Sí',
      'row:Cuando la contrataste=05-10-2026',
      'row:Aviso de renovación recibido el=01-10-2026',
      'row:Prima anterior=300,00 €',
      'row:Prima nueva=345,00 €',
      'heading:Fecha por fecha',
      'subheading:Comunicar que no renuevas',
      'text:Abierto hasta el 01-02-2027 ',
      'bullet:Tu póliza vence el 01-03-202',
      'bullet:Es dentro de 115 días.',
      'bullet:La revisión cuenta con que e',
      'bullet:Si tu póliza vence a las 00:',
      'subheading:Aviso de cambios antes del vencimiento',
      'text:Llegó con al menos dos meses',
      'bullet:La aseguradora tiene que com',
      'bullet:El aviso te llegó el 01-10-2',
      'bullet:La ley habla de cualquier mo',
      'bullet:Si lo único que cambia es la',
      'subheading:Prima del periodo siguiente',
      'text:Tu prima sube un 15 % (45,00',
      'bullet:Pasas de 300,00 € a 345,00 €',
      'subheading:Desistir de un seguro contratado a distancia',
      'text:Abierto hasta el 19-10-2026 ',
      'bullet:Son 14 días naturales, conta',
      'bullet:El último día es el 19-10-20',
      'bullet:No has metido el día en que ',
      'heading:Las normas y su estado',
      'source:Ley de Contrato de Seguro, a',
      'source:Ley de Contrato de Seguro, a',
      'source:Ley de comercialización a di',
      'source:Ley de Contrato de Seguro, a',
      'source:Ley de Contrato de Seguro, a',
      'source:Ley de Contrato de Seguro, a',
      'source:Ley de Contrato de Seguro, a',
      'heading:Para que lo tengas en cuenta',
      'subheading:Si la póliza no coincide con lo acordado',
      'text:Si la póliza no coincide con',
      'subheading:Lo que declaras al contratar',
      'text:Antes de contratar, la ley t',
      'subheading:Si aseguras por menos de lo que vale',
      'text:Si la suma asegurada es meno',
      'subheading:Si aseguras por más de lo que vale',
      'text:Si la suma asegurada supera ',
      'heading:Lo que esta revisión no comprueba',
      'bullet:Si las cláusulas de tu póliz',
      'bullet:Si el precio de tu seguro es',
      'bullet:Si la suma asegurada se ajus',
      'bullet:Cómo se valora un siniestro',
    ]);
  });

  it('leaves out the rows of a conclusion date and a notice that are not there', () => {
    expect(dataSection(policy({ concludedOn: null }))).toEqual([
      'row:Tipo de seguro=Hogar',
      'row:Vencimiento del periodo en curso=01-03-2027',
      'row:Se renueva sola=Sí',
      'row:Contratada a distancia=No',
    ]);
  });

  it('leaves out the premium that was not entered', () => {
    const dated = (change: object) => dataSection(policy({ notice: notice(change) })).slice(5);
    expect(dated({ previousPremium: null })).toEqual([
      'row:Aviso de renovación recibido el=01-10-2026',
      'row:Prima nueva=345,00 €',
    ]);
    expect(dated({ newPremium: null })).toEqual([
      'row:Aviso de renovación recibido el=01-10-2026',
      'row:Prima anterior=300,00 €',
    ]);
  });

  it('says «No lo sé» for an answer left open', () => {
    expect(dataSection(policy({ renews: null }))).toContain('row:Se renueva sola=No lo sé');
  });

  it('joins the lines of a piece of information into one text', () => {
    const texts = reportOf(policy()).blocks.flatMap((b) => (b.type === 'text' ? [b.text] : []));
    expect(texts).toContainEqual(expect.stringContaining('excluya. Por ejemplo'));
  });

  it('gives every norm once, however many findings call on it', () => {
    const citations = reportOf(
      policy({
        line: 'car',
        carCover: 'with_voluntary',
        mortgageRequired: null,
        distance: true,
        concludedOn: parseDate('2026-10-05'),
      }),
    )
      .blocks.filter((b) => b.type === 'source')
      .map((b) => b.text);
    expect(new Set(citations).size).toBe(citations.length);
  });

  it('has no section of information when there is none to give', () => {
    const input = policy();
    const r = reviewInsurance(input, TODAY, { norms: INSURANCE_NORMS });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const model = insuranceReport({ input, review: { ...r.review, information: [] } }, tr, TODAY);
    expect(model.blocks.slice(-6).map((b) => b.type)).toEqual([
      'source',
      'heading',
      'bullet',
      'bullet',
      'bullet',
      'bullet',
    ]);
  });
});
