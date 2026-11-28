// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type { Translate } from '../../src/i18n/client';
import { monthText, phraseText } from '../../src/credit/render';
import { pageTranslator } from '../support/page-strings';

const tr: Translate = pageTranslator('credit');

describe('the credit phrases', () => {
  it('write a month in words and a deadline open today as such', () => {
    expect(monthText('2019-02', tr)).toBe('febrero de 2019');
    expect(
      phraseText(
        { key: 'withdrawal.days_left', vars: { days: { days: 0 }, day: { date: '2026-10-09' } } },
        tr,
      ),
    ).toBe('Hoy, 09-10-2026, es el último día.');
  });
});
