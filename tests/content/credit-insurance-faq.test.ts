import { describe, expect, it } from 'vitest';
import { CREDIT_FAQ_TOPICS } from '../../src/content/credit-faq-topics';
import { creditFaqEntries } from '../../src/content/credit-faq';
import { faqNode } from '../../src/content/faq';
import { INSURANCE_FAQ_TOPICS } from '../../src/content/insurance-faq-topics';
import { insuranceFaqEntries } from '../../src/content/insurance-faq';

const answerOf = (entries: readonly { anchor: string; answer: string }[], anchor: string) =>
  entries.find((e) => e.anchor === anchor)?.answer ?? '';

describe('the credit FAQ', () => {
  const entries = creditFaqEntries('es');

  it('asks every topic in order and feeds the FAQPage JSON-LD with the same text', () => {
    expect(entries.map((e) => e.anchor)).toEqual(CREDIT_FAQ_TOPICS.map(([, a]) => a));
    expect(faqNode(entries).mainEntity).toEqual(
      entries.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    );
  });

  it('gives the average rate as a court criterion with its source, never an amount', () => {
    const answer = answerOf(entries, 'faq-credito-tipo-medio');
    expect(answer).toContain('STS 258/2023');
    expect(answer).toContain('es un criterio del tribunal, no una norma');
    expect(answer).toContain('un juez valora además las circunstancias del caso');
    expect(answer).not.toMatch(/€/);
  });

  it('gives the early repayment caps with their articles', () => {
    const answer = answerOf(entries, 'faq-credito-amortizar');
    for (const article of ['art. 30.2', 'art. 30.3', 'art. 30.4', 'art. 30.5'])
      expect(answer).toContain(article);
    expect(answer).toContain('el 1 %');
    expect(answer).toContain('el 0,5 %');
  });

  it('counts the withdrawal period in calendar days from the later of two days', () => {
    expect(answerOf(entries, 'faq-credito-desistir')).toContain('14 días naturales');
  });
});

describe('the insurance FAQ', () => {
  const entries = insuranceFaqEntries('es');

  it('asks every topic in order and feeds the FAQPage JSON-LD with the same text', () => {
    expect(entries.map((e) => e.anchor)).toEqual(INSURANCE_FAQ_TOPICS.map(([, a]) => a));
    expect(faqNode(entries).mainEntity).toHaveLength(INSURANCE_FAQ_TOPICS.length);
  });

  it('gives the non-renewal notice with its article and the prudent reading', () => {
    const answer = answerOf(entries, 'faq-seguro-no-renovar');
    expect(answer).toContain('art. 22.2');
    expect(answer).toContain('un mes de antelación');
    expect(answer).toContain('lo prudente es que tu escrito haya llegado');
  });

  it('says nothing of what a late notice leads to', () => {
    expect(answerOf(entries, 'faq-seguro-aviso')).toContain(
      'no se ha encontrado en una fuente oficial',
    );
  });

  it('works the proportional rule example out right', () => {
    // 20.000 € × 150.000 / 200.000 = 15.000 €.
    expect(answerOf(entries, 'faq-seguro-regla-proporcional')).toContain(
      'ante un daño de 20.000 €, la aseguradora paga 15.000 €',
    );
  });
});
