import { describe, expect, it } from 'vitest';
import { RENTAL_FAQ_TOPICS } from '../../src/content/rental-faq-topics';
import { rentalFaqEntries } from '../../src/content/rental-faq';
import { legalInterestSummary, rentalGuide } from '../../src/content/rental-guide';
import { LEGAL_INTEREST } from '../../src/engine/law/data/legal-interest';
import { NORMS } from '../../src/engine/rental/data/norms';
import type { NormTable } from '../../src/engine/rental/norms';

const CHECKED = '2026-10-08';
const legalInterest = legalInterestSummary(LEGAL_INTEREST);
const guide = (norms: NormTable) => rentalGuide('es', norms, { checkedOn: CHECKED, legalInterest });
const text = (norms: NormTable) =>
  guide(norms)
    .flatMap((b) => [...b.paragraphs, ...b.list])
    .join('\n');

const repealed: NormTable = {
  ...NORMS,
  rdl29_2026: {
    ...NORMS.rdl29_2026,
    status: 'repealed',
    inForceUntil: '2026-11-05',
    endUncertainUntil: '2026-11-06',
    statusSince: '2026-11-06',
    statusUrl: 'https://www.boe.es/',
  },
};
const validated: NormTable = {
  ...NORMS,
  rdl29_2026: {
    ...NORMS.rdl29_2026,
    status: 'in_force',
    statusSince: '2026-11-06',
    statusUrl: 'https://www.boe.es/',
  },
};

describe('the rental guide', () => {
  it('covers every block, each with its norms and a source on the BOE', () => {
    const blocks = guide(NORMS);
    expect(blocks.map((b) => b.id)).toEqual([
      'fees',
      'guarantees',
      'update',
      'charges',
      'return',
      'zones',
      'term',
      'regional',
    ]);
    for (const b of blocks) {
      expect(b.sources.length, b.id).toBeGreaterThan(0);
      expect(
        b.sources.some((s) => s.url.startsWith('https://www.boe.es/')),
        b.id,
      ).toBe(true);
    }
    expect(new Set(blocks.map((b) => b.anchor)).size).toBe(blocks.length);
  });

  it('marks the 2026 decrees as pending, as the norm table has them', () => {
    const all = text(NORMS);
    expect(all).toContain(
      'el Real Decreto-ley 29/2026, en vigor desde el 8 de octubre de 2026 y pendiente de que el Congreso lo convalide,',
    );
    expect(all).toContain(
      'el Real Decreto-ley 28/2026, que entra en vigor el 15 de noviembre de 2026 y está pendiente de que el Congreso lo convalide,',
    );
    const statuses = guide(NORMS).flatMap((b) => b.sources.map((s) => s.status));
    expect(statuses).toContain('pendiente de convalidación');
    expect(statuses).toContain('en vigor');
  });

  it('follows a validation or a repeal of RDL 29/2026 without touching the copy', () => {
    expect(text(validated)).toContain('y convalidado por el Congreso,');
    const after = text(repealed);
    expect(after).not.toContain('pendiente de que el Congreso lo convalide, dice');
    expect(after).toContain('El Real Decreto-ley 29/2026 lo cambió del 08-10-2026 hasta el');
    expect(after).toContain('pero el Congreso lo derogó');
    const sources = guide(repealed).flatMap((b) => b.sources);
    expect(sources.find((s) => s.citation.includes('29/2026'))?.status).toBe(
      'derogada el 06-11-2026',
    );
  });

  it('dates the agency fees by RDL 29/2026, and drops its dates once it is repealed', () => {
    const fees = (norms: NormTable) => {
      const b = guide(norms).find((x) => x.id === 'fees');
      return [...(b?.list ?? []), ...(b?.paragraphs ?? [])].join('\n');
    };
    expect(fees(NORMS)).toContain('entre el 26 de mayo de 2023 y el 7 de octubre de 2026');
    expect(fees(NORMS)).toContain('En un contrato anterior al 8 de octubre de 2026');
    const after = fees(repealed);
    expect(after).toContain(
      'Contratos firmados desde el 26 de mayo de 2023: son siempre del casero.',
    );
    expect(after).not.toContain('7 de octubre de 2026');
    expect(after).not.toContain('8 de octubre de 2026');
  });

  it('says a decree repealed before it took effect never applied, with no dates of its own', () => {
    const never: NormTable = {
      ...NORMS,
      rdl28_2026: {
        ...NORMS.rdl28_2026,
        status: 'repealed',
        inForceUntil: '2026-11-05',
        statusSince: '2026-11-06',
        statusUrl: 'https://www.boe.es/',
      },
    };
    const all = text(never);
    expect(all).toContain(
      'El Real Decreto-ley 28/2026 no llegó a aplicarse: el Congreso lo derogó antes de que entrara en vigor.',
    );
    expect(all).not.toContain('15-11-2026');
    expect(all).not.toContain('15 de noviembre de 2026');
    expect(all).not.toContain('lo cambió del');
    const faq = rentalFaqEntries('es', never, { checkedOn: CHECKED }).find(
      (e) => e.anchor === 'faq-alquiler-normas-pendientes',
    )?.answer;
    expect(faq).toContain(
      'El Congreso derogó el Real Decreto-ley 28/2026 antes de que entrara en vigor, así que no llegó a aplicarse.',
    );
    expect(faq).not.toContain('15 de noviembre');
    expect(faq).not.toContain('15-11-2026');
  });

  it('names the RDL 29/2026 extension in the RDL 28/2026 sentence, also once RDL 29 is repealed', () => {
    const term =
      guide(repealed)
        .find((b) => b.id === 'term')
        ?.paragraphs.join(' ') ?? '';
    expect(term).toContain('la prórroga extraordinaria del Real Decreto-ley 29/2026');
    expect(term).not.toContain('esa prórroga');
  });

  it('cites the charges by their numbering before RDL 29/2026, on that wording', () => {
    const charges = guide(NORMS).find((b) => b.id === 'charges');
    const increase = charges?.sources.find((s) => s.citation.startsWith('LAU, art. 20.2'));
    expect(increase?.citation).toContain('anterior al RDL 29/2026 (art. 20.3 desde el 08-10-2026)');
    expect(increase?.url).toContain('&p=20230525');
    expect(charges?.paragraphs.join(' ')).toContain('numera como 20.4');
    const pact = charges?.sources.find((s) => s.citation.startsWith('LAU, art. 20.1'));
    expect(pact?.citation).toContain('en su redacción anterior al RDL 29/2026');
    expect(pact?.url).toContain('&p=20230525');
  });

  it('names the legal interest from its table, with the Banco de España link', () => {
    expect(legalInterest.rate).toBe(LEGAL_INTEREST.at(-1)?.rate);
    const rate = guide(NORMS).find((b) => b.id === 'return');
    expect(rate?.paragraphs.join(' ')).toContain('El interés legal es del 3,25\u00a0% desde 2023');
    expect(rate?.links[0]?.url).toBe(LEGAL_INTEREST.at(-1)?.url);
  });

  it('gives no index figure in the rent update block', () => {
    const update = guide(NORMS).find((b) => b.id === 'update');
    expect(update?.paragraphs.join(' ')).not.toMatch(/\d,\d{2}\s?%/);
  });
});

describe('the rental FAQ', () => {
  const entries = (norms: NormTable, documents: boolean) =>
    rentalFaqEntries('es', norms, { documents, checkedOn: CHECKED });

  it('asks about documents and the pass only with the documents API', () => {
    expect(entries(NORMS, true).map((e) => e.anchor)).toEqual(RENTAL_FAQ_TOPICS.map(([, a]) => a));
    const plain = entries(NORMS, false).map((e) => e.question);
    expect(plain).not.toContain('¿Qué pasa con mis documentos?');
    expect(plain).not.toContain('¿Qué incluye el pase de 4,99 €?');
    expect(plain).toContain('¿Qué es el IRAV?');
  });

  it('lists the pending and the repealed decrees from the norm table', () => {
    const answer = (norms: NormTable) =>
      entries(norms, false).find((e) => e.anchor === 'faq-alquiler-normas-pendientes')?.answer ??
      '';
    expect(answer(NORMS)).toContain(
      'A 8 de octubre de 2026 están pendientes de convalidación el Real Decreto-ley 29/2026, en vigor desde el 8 de octubre de 2026, y el Real Decreto-ley 28/2026, que entra en vigor el 15 de noviembre de 2026.',
    );
    expect(answer(NORMS)).toContain('Real Decreto-ley 8/2026, del 22-03-2026');
    const after = answer(repealed);
    expect(after).not.toContain('pendientes de convalidación el Real Decreto-ley 29/2026');
    expect(after).toContain('Real Decreto-ley 29/2026, del 08-10-2026');
  });

  it('every answer is filled in', () => {
    for (const e of entries(NORMS, true)) {
      expect(e.answer, e.anchor).not.toMatch(/[{}]/);
      expect(e.answer.length, e.anchor).toBeGreaterThan(40);
    }
  });
});
