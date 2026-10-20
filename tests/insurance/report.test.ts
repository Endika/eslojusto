import { describe, expect, it } from 'vitest';
import { parseDate } from '../../src/engine/date';
import { INSURANCE_NORMS } from '../../src/engine/insurance/data/norms';
import { reviewInsurance } from '../../src/engine/insurance/review';
import type { Translate } from '../../src/i18n/client';
import { insuranceReport } from '../../src/insurance/report';
import { policy, TODAY } from '../engine/insurance/input';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('insurance');

describe('the insurance report', () => {
  it('gives each norm with the day it took effect and how it stands', () => {
    const input = policy();
    const r = reviewInsurance(input, TODAY, { norms: INSURANCE_NORMS });
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    const model = insuranceReport({ input, review: r.review }, tr, parseDate('2026-10-20'));
    const sources = model.blocks.filter((b) => b.type === 'source').map((b) => b.text);
    expect(sources).toContainEqual(
      expect.stringMatching(
        /^Ley de Contrato de Seguro, art\. 22\.2.* · con efectos desde el 01-01-2016 · en vigor$/,
      ),
    );
  });
});
