import { ESLint } from 'eslint';
import { beforeAll, describe, expect, it } from 'vitest';

const eslint = new ESLint();

// Loading the config and parsers takes seconds on a cold runner; pay it here, not in the first case.
beforeAll(() => eslint.lintText('', { filePath: 'src/engine/x.ts' }), 60_000);

// The rules that fired on `code` as if it lived at `filePath`; nothing is written to disk.
async function violations(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe('import boundaries', () => {
  it.each([
    ['src/engine/x.ts', "import { track } from '../analytics/posthog';"],
    ['src/engine/x.ts', "import { t } from '../i18n';"],
    ['src/engine/x.ts', "import posthog from 'posthog-js';"],
    ['src/i18n/x.ts', "import type { Cause } from '../engine/types';"],
    ['src/calculator/x.ts', "import { track } from '../analytics/posthog';"],
    ['src/calculator/x.ts', "import { snapshot } from '../analytics/events';"],
    ['src/calculator/x.ts', "import { localToday } from '../scripts/clock';"],
    ['src/content/x.ts', "import posthog from 'posthog-js';"],
    ['src/analytics/x.ts', "import { track } from './posthog';"],
    ['src/analytics/x.ts', "import { setUpCalculator } from '../calculator/main';"],
    ['src/layouts/csp.ts', "import { track } from '../analytics/posthog';"],
    ['src/views/X.astro', "---\nimport { track } from '../analytics/posthog';\n---\n"],
    ['src/views/X.astro', "<script>\n  import '../analytics/events';\n</script>\n"],
    ['src/documents/x.ts', "import { track } from '../analytics/posthog';"],
    ['src/documents/x.ts', "import { localToday } from '../scripts/clock';"],
    ['src/analytics/x.ts', "import { setUpUpload } from '../documents/upload';"],
    ['src/analytics/x.ts', "import { setUpRental } from '../rental/main';"],
    ['src/analytics/x.ts', "import { SHEET_FIELDS } from '../rental/form';"],
    ['src/analytics/x.ts', "import { rentalFaqEntries } from '../content/rental-faq';"],
    ['src/rental/x.ts', "import { rentalAnalytics } from '../analytics/rental';"],
    ['src/analytics/x.ts', "import { setUpEmployment } from '../employment/main';"],
    ['src/analytics/x.ts', "import { SHEET_FIELDS } from '../employment/form';"],
    ['src/analytics/x.ts', "import { employmentFaqEntries } from '../content/employment-faq';"],
    ['src/employment/x.ts', "import { employmentAnalytics } from '../analytics/employment';"],
    ['src/engine/rental/x.ts', "import { t } from '../../i18n';"],
    ['src/engine/rental/x.ts', "import { track } from '../../analytics/posthog';"],
    ['src/engine/rental/x.ts', "import posthog from 'posthog-js';"],
    ['src/engine/rental/x.ts', "import { NORMS } from './data/norms';"],
    ['src/engine/rental/data/x.ts', "import { t } from '../../../i18n';"],
    ['src/engine/rental/x.ts', "import { t } from './../../i18n';"],
    ['src/engine/rental/x.ts', "import { t } from '../a/../../i18n';"],
    ['src/engine/rental/x.ts', "import { NORMS } from './data';"],
    ['src/engine/rental/x.ts', "import { NORMS } from './data/index';"],
    ['src/engine/x.ts', "import { t } from './../i18n';"],
    ['src/engine/x.ts', "import { t } from './a/../../i18n';"],
    ['src/engine/employment/x.ts', "import { t } from '../../i18n';"],
    ['src/engine/employment/x.ts', "import { MINIMUM_WAGE } from './data/minimum-wage';"],
    ['src/engine/employment/x.ts', "import { RULES } from '../rental/rules';"],
    ['src/engine/rental/x.ts', "import type { NormTable } from '../employment/norms';"],
    ['src/engine/household/x.ts', "import { t } from '../../i18n';"],
    ['src/engine/household/x.ts', "import { MINIMUM_WAGE } from './data/minimum-wage';"],
    [
      'src/engine/household/x.ts',
      "import { MINIMUM_WAGE } from '../employment/data/minimum-wage';",
    ],
    ['src/engine/household/x.ts', "import { RULES } from '../employment/rules';"],
    ['src/engine/household/data/x.ts', "import type { NormTable } from '../../law/norms';"],
    ['src/engine/employment/x.ts', "import type { NormTable } from '../household/norms';"],
    ['src/engine/employment/data/x.ts', "import type { NormTable } from '../../law/norms';"],
    ['src/engine/employment/data/x.ts', "import type { Norm } from '../../norms';"],
    ['src/engine/credit/x.ts', "import { NORMS } from './data/norms';"],
    ['src/engine/credit/x.ts', "import { RULES } from '../rental/rules';"],
    ['src/engine/insurance/x.ts', "import { NORMS } from './data/norms';"],
    ['src/engine/insurance/x.ts', "import { RULES } from '../credit/rules';"],
    ['src/engine/credit/data/x.ts', "import { t } from '../../../i18n';"],
    ['src/engine/insurance/x.ts', "import { t } from '../../i18n';"],
    ['src/engine/insurance/x.ts', "import { INSURANCE_NORMS } from './data/norms';"],
    ['src/engine/insurance/x.ts', "import { RULES } from '../employment/rules';"],
    ['src/engine/rental/x.ts', "import type { NormTable } from '../insurance/norms';"],
    ['src/engine/insurance/data/x.ts', "import type { NormTable } from '../../law/norms';"],
    ['src/engine/law/x.ts', "import type { NormId } from '../rental/norms';"],
    ['src/engine/law/x.ts', "import type { Phrase } from '../calculation';"],
    ['src/engine/law/x.ts', "import { t } from '../../i18n';"],
    ['src/engine/law/x.ts', "import { t } from './../../i18n';"],
    ['src/calculator/navigation.ts', "import { STEPS } from './steps';"],
    ['src/calculator/tabs.ts', "import { applies } from './conditions';"],
    ['src/calculator/flow.ts', "import { reviewFinalPay } from '../engine/review';"],
    ['src/documents/upload.ts', "import { prefillFrom } from './prefill';"],
    ['src/documents/payment.ts', "import { hasShortfall } from './case';"],
    ['src/documents/pdf.ts', "import { reportModel } from './report';"],
    ['src/documents/ports.ts', "import type { CompletedReview } from '../calculator/ports';"],
    ['src/documents/upload.ts', "import type { Calculator } from '../calculator/main';"],
    [
      'src/scripts/documents.ts',
      "import { finalPayReading } from '../documents/final-pay-reading';",
    ],
    ['src/scripts/documents.ts', "import { STEPS } from '../calculator/steps';"],
    // Every spelling of a final-pay piece, from any shared documents module.
    ...[
      './prefill',
      './prefill.js',
      './prefill.ts',
      './prefill/',
      './prefill/index',
      '../documents/prefill',
      './../documents/prefill',
      './/prefill',
      './case',
      './report',
      './final-pay-reading',
      '../calculator/ports',
      '../calculator/main',
      '../calculator/steps',
      '../calculator/dom.js',
      '../engine/review',
      '../engine/date.ts',
      '../engine/law/norms',
      '../scripts/clock',
      'posthog-js',
    ].flatMap((source) =>
      ['upload', 'payment', 'pdf', 'ports', 'letter', 'summary', 'x'].map(
        (file): [string, string] => [`src/documents/${file}.ts`, `import { x } from '${source}';`],
      ),
    ),
    ...[
      '../documents/case',
      '../documents/final-pay-reading.js',
      '../documents/prefill',
      '../documents/report',
      './../documents/case',
      '../calculator/ports',
      '../calculator/steps',
      '../calculator/main',
      '../engine/review',
      './final-pay-documents',
    ].map(
      (source): [string, string] =>
        ['src/scripts/documents.ts', `import { x } from '${source}';`] as const,
    ),
    // The rental review gets its tables from its composition root and shares only the sheets.
    ...[
      '../engine/rental/data/tables',
      '../engine/rental/data',
      '../engine/rental/data/norms',
      '../engine/review',
      '../engine/employment/norms',
      '../calculator/main',
      '../calculator/render',
      '../calculator/form',
      '../documents/case',
      '../analytics/posthog',
      '../scripts/clock',
      './../engine/rental/data/tables',
      // Of reading documents, never the final pay's pieces nor the platform's own workings.
      '../documents/prefill',
      '../documents/final-pay-reading',
      '../documents/report',
      '../documents/upload',
      '../documents/payment',
      '../documents/pdf',
      '../documents/api',
      './../documents/contract',
      '../documents//ports',
    ].map((source): [string, string] => ['src/rental/x.ts', `import { x } from '${source}';`]),
    // The employment review gets its tables from its composition root and shares only the sheets.
    ...[
      '../engine/employment/data/norms',
      '../engine/employment/data',
      '../engine/employment/data/minimum-wage',
      '../engine/rental/review',
      '../engine/review',
      '../calculator/main',
      '../calculator/render',
      '../rental/summary',
      '../analytics/posthog',
      '../scripts/clock',
      './../engine/employment/data/norms',
      // Of reading documents, never the final pay's pieces nor the platform's own workings.
      '../documents/prefill',
      '../documents/final-pay-reading',
      '../documents/report',
      '../documents/upload',
      '../documents/payment',
      '../documents/pdf',
      '../documents/case',
      '../documents/api',
      './../documents/contract',
      '../documents//ports',
      '../documents//letter',
      '../engine/severance',
    ].map((source): [string, string] => ['src/employment/x.ts', `import { x } from '${source}';`]),
    ...['../employment/main', '../employment/form'].map((source): [string, string] => [
      'src/calculator/x.ts',
      `import { x } from '${source}';`,
    ]),
    ...['../rental/main', '../rental/form'].map((source): [string, string] => [
      'src/calculator/x.ts',
      `import { x } from '${source}';`,
    ]),
    ...['./steps', './conditions', './flow.js', './../calculator/flow', '../engine/review'].map(
      (source): [string, string] => [
        'src/calculator/navigation.ts',
        `import { x } from '${source}';`,
      ],
    ),
  ])('%s cannot %s', async (filePath, code) => {
    expect(await violations(filePath, code)).toContain('no-restricted-imports');
  });

  it.each([
    ['src/engine/employment/x.ts', "import { RULES } from '.././rental/rules';"],
    ['src/engine/employment/x.ts', "import { RULES } from '..//rental/rules';"],
    ['src/engine/employment/x.ts', "import { RULES } from '../law/./../rental/rules';"],
    ['src/engine/employment/x.ts', "import { MINIMUM_WAGE } from '././data/minimum-wage';"],
    ['src/engine/employment/x.ts', "import { MINIMUM_WAGE } from './/data/minimum-wage';"],
    ['src/engine/employment/data/x.ts', "import type { NormTable } from '.././norms';"],
    ['src/engine/law/x.ts', "import { toIso } from '..//date';"],
    ['src/engine/law/x.ts', "import { toIso } from '.././date';"],
    ['src/engine/x.ts', "import { round2 } from '././money';"],
    ['src/i18n/x.ts', "import { es } from './/es';"],
  ])('%s cannot spell a path around them: %s', async (filePath, code) => {
    expect(await violations(filePath, code)).toContain('no-restricted-imports');
  });

  it.each([
    "import { RULES } from './rental/rules';",
    "export { RULES } from './rental/rules';",
    "export * from './rental/data/norms';",
    "export type { NormTable } from './employment/norms';",
    "export * from './employment';",
    "export * from './insurance/review';",
  ])('the engine root cannot reach into a section: %s', async (code) => {
    expect(await violations('src/engine/x.ts', code)).toContain('no-restricted-imports');
  });

  it.each([
    ['src/engine/employment/x.ts', "export type R = typeof import('../rental/rules');"],
    ['src/engine/x.ts', "export type R = typeof import('./rental/data/norms');"],
    ['src/calculator/x.ts', "export type P = typeof import('../analytics/posthog');"],
    ['src/engine/employment/x.ts', "import rules = require('../rental/rules');\nexport { rules };"],
  ])('%s cannot hide an import in %s', async (filePath, code) => {
    expect(await violations(filePath, code)).toContain('no-restricted-syntax');
  });

  it.each([
    'export const now = () => new top.Date();',
    'export const now = () => new parent.Date();',
    'export const now = () => new frames.Date();',
    'export const now = () => new opener.Date();',
    'export const now = () => new Intl.DateTimeFormat().format();',
  ])('the engine cannot reach the clock through a window alias or Intl: %s', async (code) => {
    expect(await violations('src/engine/rental/x.ts', code)).toContain('no-restricted-globals');
  });

  it.each([
    "import { track } from './posthog.js';",
    "import { track } from './posthog.ts';",
    "import { track } from './posthog/';",
    "import { setUpCalculator } from '../engine/../calculator/main';",
    "import { RENTAL_FIELDS } from '../rental/./ports';",
    "import { RENTAL_FIELDS } from '../engine/../rental/ports';",
    "import { EMPLOYMENT_FIELDS } from '../employment/./ports';",
    "import { EMPLOYMENT_FIELDS } from '../engine/../employment/ports';",
  ])(
    'analytics cannot reach the adapter or other zones by spelling the path differently: %s',
    async (code) => {
      expect(await violations('src/analytics/x.ts', code)).toContain('no-restricted-imports');
    },
  );

  it('the engine cannot reach the browser or the clock', async () => {
    const fired = await violations(
      'src/engine/x.ts',
      'export const now = () => [new Date(), document.title, performance.now()];',
    );
    expect(fired.filter((r) => r === 'no-restricted-globals')).toHaveLength(3);
  });

  it.each([
    'src/engine/rental/x.ts',
    'src/engine/rental/data/x.ts',
    'src/engine/employment/x.ts',
    'src/engine/employment/data/x.ts',
    'src/engine/insurance/x.ts',
    'src/engine/insurance/data/x.ts',
    'src/engine/law/x.ts',
  ])('%s cannot read the clock', async (filePath) => {
    expect(await violations(filePath, 'export const now = () => new Date();')).toContain(
      'no-restricted-globals',
    );
  });

  it.each([
    'src/engine/x.ts',
    'src/engine/rental/x.ts',
    'src/engine/rental/data/x.ts',
    'src/engine/employment/x.ts',
    'src/engine/law/x.ts',
  ])('%s cannot reach the clock through globalThis', async (filePath) => {
    const fired = await violations(
      filePath,
      'export const now = () => [new globalThis.Date(), globalThis.performance.now()];',
    );
    expect(fired.filter((r) => r === 'no-restricted-properties')).toHaveLength(2);
  });

  it.each(
    [
      'src/engine/x.ts',
      'src/engine/law/x.ts',
      'src/engine/rental/x.ts',
      'src/engine/rental/data/x.ts',
      'src/engine/employment/x.ts',
      'src/engine/employment/data/x.ts',
    ].flatMap((filePath) =>
      [
        'export const now = () => new global.Date();',
        'export const now = () => process.hrtime();',
        'const g = globalThis;\nexport const now = () => new g.Date();',
        'const g = self;\nexport const now = () => g.performance.now();',
        "export const now = () => Function('return new Date()')();",
        "export const now = () => eval('new Date()');",
        'export const now = () => Temporal.Now.instant();',
      ].map((code) => [filePath, code]),
    ),
  )('%s cannot reach the global object: %s', async (filePath, code) => {
    expect(await violations(filePath, code)).toContain('no-restricted-globals');
  });

  it.each([
    ['src/documents/rental/x.ts', "import { track } from '../../analytics/posthog';"],
    ['src/documents/rental/x.ts', "import { prefillFrom } from '../prefill';"],
    ['src/documents/rental/x.ts', "import { upload } from '../upload';"],
    ['src/documents/fonts/x.ts', "import type { EmbeddedFont } from './../pdf-writer';"],
  ])('a subfolder of src/documents holds data: %s cannot %s', async (filePath, code) => {
    expect(await violations(filePath, code)).toContain('no-restricted-imports');
  });

  it('a dynamic import cannot slip past them', async () => {
    expect(
      await violations('src/calculator/x.ts', "export const a = import('../analytics/posthog');"),
    ).toContain('no-restricted-syntax');
    expect(await violations('src/documents/x.ts', "export const a = import('./pdf');")).toContain(
      'no-restricted-syntax',
    );
  });

  it.each([
    ['src/scripts/x.ts', "import { track } from '../analytics/posthog';"],
    ['src/analytics/x.ts', "import type { CalculatorEvents } from '../calculator/ports';"],
    ['src/layouts/csp.ts', "import { ANALYTICS_ORIGIN } from '../analytics/config';"],
    ['src/calculator/x.ts', "import { reviewFinalPay } from '../engine/review';"],
    ['src/analytics/x.ts', "import type { DocumentEvents } from '../documents/ports';"],
    ['src/analytics/x.ts', "import type { RentalEvents } from '../rental/ports';"],
    ['src/analytics/x.ts', "import { RENTAL_FIELDS } from '../rental/ports';"],
    ['src/analytics/x.ts', "import { RENTAL_FAQ_TOPICS } from '../content/rental-faq-topics';"],
    ['src/analytics/x.ts', "import type { EmploymentEvents } from '../employment/ports';"],
    ['src/analytics/x.ts', "import { EMPLOYMENT_FIELDS } from '../employment/ports';"],
    [
      'src/analytics/x.ts',
      "import { EMPLOYMENT_FAQ_TOPICS } from '../content/employment-faq-topics';",
    ],
    ['src/layouts/csp.ts', "import { TURNSTILE_ORIGIN } from '../documents/config';"],
    ['src/scripts/x.ts', "export const pdf = () => import('../documents/pdf');"],
    ['src/engine/rental/x.ts', "import { round2 } from '../money';"],
    ['src/engine/rental/x.ts', "import type { NormTable } from './norms';"],
    ['src/engine/rental/data/x.ts', "import type { NormTable } from '../norms';"],
    ['src/engine/rental/x.ts', "import { activeRules } from '../law/rules';"],
    ['src/engine/employment/x.ts', "import { round2 } from '../money';"],
    ['src/engine/employment/x.ts', "import { normStanding } from '../law/norms';"],
    ['src/engine/employment/x.ts', "import type { NormTable } from './norms';"],
    ['src/engine/employment/data/x.ts', "import type { NormTable } from '../norms';"],
    ['src/engine/credit/x.ts', "import { normStanding } from '../law/norms';"],
    ['src/engine/credit/data/x.ts', "import type { NormTable } from '../norms';"],
    ['src/engine/insurance/x.ts', "import { normStanding } from '../law/norms';"],
    ['src/engine/insurance/x.ts', "import { addDays } from '../date';"],
    ['src/engine/insurance/x.ts', "import { activeRules } from '../law/rules';"],
    ['src/engine/insurance/x.ts', "import type { NormTable } from './norms';"],
    ['src/engine/insurance/data/x.ts', "import type { NormTable } from '../norms';"],
    ['src/engine/law/x.ts', "import { toIso } from '../date';"],
    ['src/engine/law/x.ts', "import { round2 } from '../money';"],
    ['src/engine/law/x.ts', "import type { Source } from '../sources';"],
    ['src/engine/law/x.ts', "import type { NormStatus } from './norms';"],
    ['src/calculator/navigation.ts', "import { stepFrom, type Flow } from './flow';"],
    ['src/calculator/steps.ts', "import { applies } from './conditions';"],
    ['src/documents/upload.ts', "import type { ReviewForm } from './ports';"],
    ['src/documents/upload.ts', "import { required } from '../calculator/dom';"],
    ['src/documents/payment.ts', "import { parseDate } from '../engine/date';"],
    ['src/documents/pdf.ts', "import { sans } from './fonts/sans';"],
    ['src/documents/fonts/x.ts', "import type { EmbeddedFont } from '../pdf-writer';"],
    ['src/documents/contract.ts', "import { X } from '../../api/src/domain/image-limit';"],
    ['src/documents/report.ts', "import { formatEuros } from '../calculator/number';"],
    ['src/scripts/documents.ts', "import { setUpUpload } from '../documents/upload';"],
    ['src/scripts/documents.ts', "import type { Detail } from '../calculator/flow';"],
    ['src/documents/case.ts', "import { reportModel } from './report';"],
    ['src/scripts/final-pay-documents.ts', "import { finalPayCase } from '../documents/case';"],
    ['src/rental/x.ts', "import { reviewRental } from '../engine/rental/review';"],
    ['src/rental/x.ts', "import { parseDate } from '../engine/date';"],
    ['src/rental/x.ts', "import { createNavigation } from '../calculator/navigation';"],
    ['src/rental/x.ts', "import { parseAmount } from '../calculator/number';"],
    ['src/rental/x.ts', "import type { Translate } from '../i18n/client';"],
    ['src/rental/x.ts', "import { SHEETS } from './form';"],
    ['src/scripts/rental.ts', "import { RENTAL_TABLES } from '../engine/rental/data/tables';"],
    ['src/rental/x.ts', "import type { RentalExtraction } from '../documents/contract';"],
    ['src/rental/x.ts', "import type { ReadPrefill } from '../documents/ports';"],
    ['src/rental/x.ts', "import { conflictLines } from '../documents/summary';"],
    ['src/rental/x.ts', "import type { LetterDetails } from '../documents/letter';"],
    ['src/scripts/rental-documents.ts', "import { rentalCase } from '../rental/case';"],
    ['src/rental/x.ts', "import type { FormEntries } from '../calculator/fill';"],
    ['src/scripts/rental-documents.ts', "import { rentalReading } from '../rental/reading';"],
    ['src/employment/x.ts', "import { reviewEmployment } from '../engine/employment/review';"],
    ['src/employment/x.ts', "import type { LetterDetails } from '../documents/letter';"],
    ['src/employment/x.ts', "import { LAW_QUOTES } from '../engine/employment/quotes';"],
    ['src/scripts/employment-documents.ts', "import { employmentCase } from '../employment/case';"],
    ['src/employment/x.ts', "import type { Figure } from '../engine/calculation';"],
    ['src/employment/x.ts', "import type { NormSource } from '../engine/law/sources';"],
    ['src/employment/x.ts', "import { createNavigation } from '../calculator/navigation';"],
    ['src/employment/x.ts', "import type { Translate } from '../i18n/client';"],
    ['src/employment/x.ts', "import { shownPair } from '../calculator/amounts';"],
    ['src/rental/x.ts', "import { shownPair } from '../calculator/amounts';"],
    ['src/employment/x.ts', "import type { EmploymentExtraction } from '../documents/contract';"],
    ['src/employment/x.ts', "import type { ReadPrefill } from '../documents/ports';"],
    ['src/employment/x.ts', "import { conflictLines } from '../documents/summary';"],
    ['src/employment/x.ts', "import type { FormEntries } from '../calculator/fill';"],
    [
      'src/scripts/employment-documents.ts',
      "import { employmentReading } from '../employment/reading';",
    ],
    [
      'src/scripts/employment.ts',
      "import { MINIMUM_WAGE } from '../engine/employment/data/minimum-wage';",
    ],
  ])('%s may %s', async (filePath, code) => {
    expect(await violations(filePath, code)).not.toContain('no-restricted-imports');
  });

  it('the documents wiring loads on demand only the PDF writer and pdf.js', async () => {
    const lazy = (source: string) =>
      violations('src/scripts/documents.ts', `export const m = () => import('${source}');`);
    expect(await lazy('../documents/pdf')).not.toContain('no-restricted-syntax');
    expect(await lazy('./pdf-pages')).not.toContain('no-restricted-syntax');
    for (const source of ['../documents/report', '../documents/pdf.js', './final-pay-documents'])
      expect(await lazy(source), source).toContain('no-restricted-syntax');
    expect(
      await violations('src/scripts/documents.ts', 'export const m = (s: string) => import(s);'),
    ).toContain('no-restricted-syntax');
  });
});
