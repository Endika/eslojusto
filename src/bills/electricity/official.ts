import { formatCalculationEuros } from '../../calculator/number';
import type { Block } from '../../documents/ports';
import {
  officialFigures,
  type EnergyFigures,
  type OfficialDeps,
  type PowerAgainstUse,
} from '../../engine/bills/electricity-official';
import type { NormTable } from '../../engine/bills/norms';
import { ruleSource } from '../../engine/bills/rules';
import type { Translate } from '../../i18n/client';
import { sourceText } from '../result';
import type { CompletedElectricityReview } from './ports';
import { billHeading } from './year';

// Where the PVPC prices come from, beside the table that holds them.
export interface PvpcSource {
  readonly source: string;
  readonly url: string;
}

const KW = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 3, useGrouping: 'always' });
const PRICE = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
  useGrouping: 'always',
});

const kw = (n: number, tr: Translate) => tr('client.bills.unit.kw', { n: KW.format(n) });
const kwh = (n: number, tr: Translate) => tr('client.bills.unit.kwh', { n: KW.format(n) });
const perKwh = (n: number, tr: Translate) =>
  tr('client.bills.unit.per_kwh', { n: PRICE.format(n) });
const euros = formatCalculationEuros;

const text = (t: string): Block => ({ type: 'text', text: t });
const bullet = (t: string): Block => ({ type: 'bullet', text: t });
const note = (t: string): Block => ({ type: 'note', text: t });

function energyBlocks(
  year: number,
  energy: EnergyFigures,
  pvpc: PvpcSource,
  deps: OfficialDeps,
  norms: NormTable,
  tr: Translate,
): Block[] {
  const heading = text(tr('client.bills.electricity.report.official.energy'));
  if (energy.kind === 'pvpc_bill')
    return [heading, note(tr('client.bills.electricity.report.official.pvpc_bill'))];
  if (energy.kind === 'pending')
    return [heading, note(tr('client.bills.electricity.report.official.pending'))];
  const hours = deps.tollHolidays.find((h) => h.year === year);
  const eligibility = ruleSource('pvpc_eligibility', norms);
  return [
    heading,
    ...energy.periods.map((p) =>
      bullet(
        p.period === 'all'
          ? tr('client.bills.electricity.report.official.energy_single', {
              kwh: kwh(p.kwh, tr),
              tuPrecio: perKwh(p.yourPrice, tr),
              tuCoste: euros(p.yourCost),
              pvpcPrecio: perKwh(p.pvpcPrice, tr),
              pvpcCoste: euros(p.pvpcCost),
            })
          : tr('client.bills.electricity.report.official.energy_period', {
              periodo: tr(`client.bills.electricity.report.official.period.${p.period}`),
              kwh: kwh(p.kwh, tr),
              tuPrecio: perKwh(p.yourPrice, tr),
              tuCoste: euros(p.yourCost),
              pvpcPrecio: perKwh(p.pvpcPrice, tr),
              pvpcCoste: euros(p.pvpcCost),
            }),
      ),
    ),
    ...(energy.periods.length > 1
      ? [
          text(
            tr('client.bills.electricity.report.official.energy_total', {
              tuCoste: euros(energy.yourCost),
              pvpcCoste: euros(energy.pvpcCost),
            }),
          ),
        ]
      : []),
    ...(energy.singlePrice
      ? [note(tr('client.bills.electricity.report.official.single_note'))]
      : []),
    note(tr('client.bills.electricity.report.official.estimate')),
    note(tr('client.bills.electricity.report.official.who')),
    {
      type: 'source',
      text: tr('client.bills.electricity.report.official.source_pvpc', { fuente: pvpc.source }),
      url: pvpc.url,
    },
    ...(hours ? [{ type: 'source', text: hours.citation, url: hours.url } as const] : []),
    {
      type: 'source',
      text: `${eligibility.citation} · ${sourceText(eligibility, tr)}`,
      url: eligibility.url,
    },
  ];
}

function powerBlocks(power: readonly PowerAgainstUse[], norms: NormTable, tr: Translate): Block[] {
  const change = ruleSource('power_change', norms);
  const periodName = (p: PowerAgainstUse) =>
    tr(`client.bills.electricity.report.official.power_period.${p.period}`);
  return [
    text(tr('client.bills.electricity.report.official.power')),
    ...power.map((p) =>
      bullet(
        p.maxUsed === null
          ? tr('client.bills.electricity.report.official.power_unknown', {
              periodo: periodName(p),
              contratada: kw(p.contracted, tr),
            })
          : p.perKwYear === null || p.unusedPerYear === null
            ? tr('client.bills.electricity.report.official.power_period_no_price', {
                periodo: periodName(p),
                contratada: kw(p.contracted, tr),
                maxima: kw(p.maxUsed, tr),
              })
            : tr('client.bills.electricity.report.official.power_period', {
                periodo: periodName(p),
                contratada: kw(p.contracted, tr),
                maxima: kw(p.maxUsed, tr),
                porKw: euros(p.perKwYear),
                sobrantes: kw(p.unusedKw, tr),
                coste: euros(p.unusedPerYear),
              }),
      ),
    ),
    ...power.flatMap((p) =>
      p.aboveContracted && p.maxUsed !== null
        ? [
            note(
              tr('client.bills.electricity.report.official.power_above', {
                periodo: tr(`client.bills.electricity.report.official.power_in.${p.period}`),
                maxima: kw(p.maxUsed, tr),
                contratada: kw(p.contracted, tr),
              }),
            ),
          ]
        : [],
    ),
    note(tr('client.bills.electricity.report.official.power_change')),
    { type: 'source', text: `${change.citation} · ${sourceText(change, tr)}`, url: change.url },
  ];
}

// «Tus cifras frente a las oficiales»: for each bill that counts, its energy beside the PVPC of the
// same days and its power beside the power used, with their sources; a line saying the section is
// missing when the PVPC prices could not be loaded.
export function officialBlocks(
  entries: readonly CompletedElectricityReview[],
  official: { readonly deps: OfficialDeps; readonly pvpc: PvpcSource } | null,
  norms: NormTable,
  tr: Translate,
): Block[] {
  const head: Block[] = [
    { type: 'heading', text: tr('client.bills.electricity.report.official.heading') },
  ];
  if (official === null)
    return [...head, note(tr('client.bills.electricity.report.official.unavailable'))];
  const bills = entries.flatMap((entry) => {
    const figures = officialFigures(entry.input, official.deps);
    const blocks = [
      ...(figures.energy === null
        ? []
        : energyBlocks(
            entry.input.readingTo.y,
            figures.energy,
            official.pvpc,
            official.deps,
            norms,
            tr,
          )),
      ...(figures.power === null ? [] : powerBlocks(figures.power, norms, tr)),
    ];
    return blocks.length === 0
      ? []
      : [{ type: 'subheading', text: billHeading(entry, tr) } as const, ...blocks];
  });
  return bills.length === 0
    ? []
    : [...head, text(tr('client.bills.electricity.report.official.intro')), ...bills];
}
