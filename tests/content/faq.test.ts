import { describe, expect, it } from 'vitest';
import { FAQ_TOPICS } from '../../src/content/faq-topics';
import { faqEntries, faqPage } from '../../src/content/faq';
import { LATE_INTEREST_RATE } from '../../src/engine/late-interest';

const answerOf = (anchor: string) =>
  faqEntries('es', { documents: true }).find((e) => e.anchor === anchor)?.answer ?? '';

describe('the final pay FAQ', () => {
  it('asks every topic in order, and about documents and the pass only with documents', () => {
    expect(faqEntries('es', { documents: true }).map((e) => e.anchor)).toEqual(
      FAQ_TOPICS.map(([, a]) => a),
    );
    const plain = faqEntries('es').map((e) => e.anchor);
    expect(plain).not.toContain('faq-documentos');
    expect(plain).not.toContain('faq-pase');
  });

  it('feeds the FAQPage JSON-LD with the same questions and answers', () => {
    const entries = faqEntries('es');
    expect(faqPage('es').mainEntity).toEqual(
      entries.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    );
  });

  it('gives a collective dismissal the objective minimum, which the agreement may improve', () => {
    const answer = answerOf('faq-ere');
    expect(answer).toContain('20 días');
    expect(answer).toContain('12 mensualidades');
    expect(answer).toContain('arts. 51.4 y 53.1 ET');
    expect(answer).toContain('art. 51.2 ET');
    expect(answer).toContain('o más, según el acuerdo del ERE');
  });

  it('reviews without the cause only what does not depend on it', () => {
    const answer = answerOf('faq-sin_causa');
    expect(answer).toContain('«No lo sé»');
    expect(answer).toContain('sin ella no se calcula');
    expect(answer).toContain('certificado de empresa');
  });

  it('says a dismissal could be null, with no figure, and gives the deadline to challenge it', () => {
    const answer = answerOf('faq-nulo');
    expect(answer).toContain('podría ser nulo');
    expect(answer).toContain('art. 55.5 ET');
    expect(answer).toContain('Ley 15/2022, arts. 2.1 y 26');
    expect(answer).toContain('sin dar cifras');
    expect(answer).toContain('20 días hábiles (art. 59.3 ET)');
  });

  it('puts late interest on salary only, at the engine rate, with a year to claim', () => {
    const answer = answerOf('faq-intereses');
    expect(answer).toContain(`${LATE_INTEREST_RATE * 100} % al año`);
    expect(answer).toContain('art. 29.3 ET');
    expect(answer).toContain('rcud 1315/2013');
    expect(answer).toContain('La indemnización no lo lleva');
    expect(answer).toContain('un año desde la baja (art. 59.1 y 59.2 ET)');
  });

  it('counts severance after an ERTE on the salary before it', () => {
    const answer = answerOf('faq-erte');
    expect(answer).toContain('salario completo de antes del ERTE');
    expect(answer).toContain('STS 678/2018');
    expect(answer).toContain('STS 638/2022');
  });

  it('counts the collective dismissal among those with 20 working days to challenge', () => {
    expect(answerOf('faq-plazos')).toContain('(objetivo, colectivo, improcedente o disciplinario)');
  });
});
