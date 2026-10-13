import { describe, expect, it } from 'vitest';
import { BILLS_DOCUMENT_TOPICS, BILLS_FAQ_TOPICS } from '../../src/content/bills-faq-topics';
import { billsFaqEntries } from '../../src/content/bills-faq';
import { faqNode } from '../../src/content/faq';

const answerOf = (entries: readonly { anchor: string; answer: string }[], anchor: string) =>
  entries.find((e) => e.anchor === anchor)?.answer ?? '';

describe.each(['electricity', 'telecom'] as const)('the %s FAQ', (review) => {
  const all = billsFaqEntries('es', review, { documents: true });

  it('asks its own topics in order and feeds the FAQPage JSON-LD with the same text', () => {
    expect(all.map((e) => e.anchor)).toEqual(
      BILLS_FAQ_TOPICS.filter(([, , page]) => page === review).map(([, anchor]) => anchor),
    );
    for (const { question, answer } of all) {
      expect(question).toMatch(/^¿.+\?$/);
      expect(answer.length).toBeGreaterThan(80);
    }
    expect(faqNode(all).mainEntity).toEqual(
      all.map(({ question, answer }) => ({
        '@type': 'Question',
        name: question,
        acceptedAnswer: { '@type': 'Answer', text: answer },
      })),
    );
  });

  it('asks about the documents and the pass only in a build that reads them', () => {
    const anchors = billsFaqEntries('es', review).map((e) => e.anchor);
    const documentAnchors = BILLS_FAQ_TOPICS.filter(
      ([id, , page]) => page === review && BILLS_DOCUMENT_TOPICS.includes(id),
    ).map(([, anchor]) => anchor);
    expect(documentAnchors).toHaveLength(2);
    for (const anchor of documentAnchors) expect(anchors).not.toContain(anchor);
  });
});

describe('the electricity answers', () => {
  const entries = billsFaqEntries('es', 'electricity', { documents: true });

  it('gives the regulated meter rent with its order', () => {
    const answer = answerOf(entries, 'faq-luz-contador');
    expect(answer).toContain('0,81 € al mes');
    expect(answer).toContain('1,36 € al mes');
    expect(answer).toContain('Orden IET/1491/2013');
  });

  it('dates VAT by the day the bill falls due and leaves November and December open', () => {
    const answer = answerOf(entries, 'faq-luz-iva');
    expect(answer).toContain('arts. 75 y 90.Dos');
    expect(answer).toContain('Real Decreto-ley 25/2026, arts. 18 y 19');
    expect(answer).toContain('no suma ninguna diferencia que dependa de ello');
  });

  it('gives the 2026 social bonus discounts beside the permanent ones', () => {
    const answer = answerOf(entries, 'faq-luz-bono-social');
    for (const figure of ['42,5 %', '57,5 %', '35 %', '50 %']) expect(answer).toContain(figure);
  });

  it('says the CUPS leaves the server only as a fingerprint', () => {
    expect(answerOf(entries, 'faq-luz-documentos')).toContain('el CUPS no sale del servidor');
  });
});

describe('the telecom answers', () => {
  const entries = billsFaqEntries('es', 'telecom');

  it('works the proportional penalty example out right', () => {
    // 180 € × 184 / 549 = 60,33 €.
    expect(answerOf(entries, 'faq-permanencia-penalizacion')).toContain(
      '180 × 184 / 549 = 60,33 €',
    );
  });

  it('names the two working days of art. 7', () => {
    expect(answerOf(entries, 'faq-permanencia-irte')).toContain('Real Decreto 899/2009, art. 7');
  });
});
