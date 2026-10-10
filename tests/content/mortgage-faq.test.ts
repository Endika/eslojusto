import { describe, expect, it } from 'vitest';
import { faqNode } from '../../src/content/faq';
import { mortgageFaqEntries } from '../../src/content/mortgage-faq';
import {
  MORTGAGE_DOCUMENT_TOPICS,
  MORTGAGE_FAQ_TOPICS,
} from '../../src/content/mortgage-faq-topics';

const answerOf = (entries: readonly { anchor: string; answer: string }[], anchor: string) =>
  entries.find((e) => e.anchor === anchor)?.answer ?? '';

describe('the mortgage FAQ', () => {
  const entries = mortgageFaqEntries('es', { documents: true });

  it('asks every topic in order and feeds the FAQPage JSON-LD with the same text', () => {
    expect(entries.map((e) => e.anchor)).toEqual(MORTGAGE_FAQ_TOPICS.map(([, a]) => a));
    expect(faqNode(entries).mainEntity).toEqual(
      entries.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    );
  });

  it('asks about documents and the pass only in a build that reads documents', () => {
    const anchors = mortgageFaqEntries('es').map((e) => e.anchor);
    for (const [id, anchor] of MORTGAGE_FAQ_TOPICS)
      expect(anchors.includes(anchor), id).toBe(!MORTGAGE_DOCUMENT_TOPICS.includes(id));
  });

  it('gives the costs by law with their article and the earlier split with its condition', () => {
    const answer = answerOf(entries, 'faq-hipoteca-gastos');
    expect(answer).toContain('art. 14.1.e de la Ley 5/2019');
    expect(answer).toContain('16-06-2019');
    expect(answer).toContain('hace falta que el banco lo acepte o que un juez anule la cláusula');
  });

  it('says the split before 2019 gives no figure yet', () => {
    expect(answerOf(entries, 'faq-hipoteca-antes-2019')).toContain(
      'por ahora, la revisión lo explica sin dar cifra',
    );
  });

  it('dates the tax on the lender from 10-11-2018', () => {
    expect(answerOf(entries, 'faq-hipoteca-impuesto')).toContain('10-11-2018');
  });

  it('gives the early repayment caps of each regime', () => {
    const answer = answerOf(entries, 'faq-hipoteca-amortizar');
    for (const cap of ['0,15 %', '0,25 %', '2 %', '1,5 %', '0,5 %']) expect(answer).toContain(cap);
    expect(answer).toContain('Ley 41/2007');
  });

  it('values neither a floor clause nor the IRPH, and works out no amount', () => {
    for (const anchor of ['faq-hipoteca-suelo', 'faq-hipoteca-irph']) {
      const answer = answerOf(entries, anchor);
      expect(answer, anchor).toMatch(/no l[ao] valora/);
      expect(answer, anchor).not.toMatch(/€/);
    }
  });
});
