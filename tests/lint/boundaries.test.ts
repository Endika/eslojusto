import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const eslint = new ESLint();

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
    ['src/engine/employment/data/x.ts', "import type { NormTable } from '../../law/norms';"],
    ['src/engine/employment/data/x.ts', "import type { Norm } from '../../norms';"],
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
    ['src/engine/law/x.ts', "import { toIso } from '../date';"],
    ['src/engine/law/x.ts', "import { round2 } from '../money';"],
    ['src/engine/law/x.ts', "import type { Source } from '../sources';"],
    ['src/engine/law/x.ts', "import type { NormStatus } from './norms';"],
    ['src/calculator/navigation.ts', "import { stepFrom, type Flow } from './flow';"],
    ['src/calculator/steps.ts', "import { applies } from './conditions';"],
    ['src/documents/upload.ts', "import type { ReviewForm } from './ports';"],
    ['src/documents/case.ts', "import { reportModel } from './report';"],
    ['src/scripts/final-pay-documents.ts', "import { finalPayCase } from '../documents/case';"],
  ])('%s may %s', async (filePath, code) => {
    expect(await violations(filePath, code)).not.toContain('no-restricted-imports');
  });
});
