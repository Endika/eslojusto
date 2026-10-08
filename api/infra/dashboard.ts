import { Aws, Duration, type Stack } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import {
  ESCALATION_MODEL,
  FUNCTION_NAMES,
  MODEL_PRICES_USD_PER_MTOK,
  PRIMARY_MODEL,
  REGION,
} from '../src/config';

export const DASHBOARD_NAME = 'eslojusto-api';
// The account's concurrent-execution quota in eu-south-2 (`aws lambda get-account-settings`).
const ACCOUNT_CONCURRENCY_LIMIT = 10;

type FunctionKey = keyof typeof FUNCTION_NAMES;
const KEYS = Object.keys(FUNCTION_NAMES) as FunctionKey[];
const logGroup = (key: FunctionKey) => `/aws/lambda/${FUNCTION_NAMES[key]}`;
const HOUR = Duration.hours(1);
const LAST_24H = '-PT24H';

const lambdaMetric = (key: FunctionKey, metricName: string, statistic = 'Sum') =>
  new cw.Metric({
    namespace: 'AWS/Lambda',
    metricName,
    dimensionsMap: { FunctionName: FUNCTION_NAMES[key] },
    statistic,
    period: HOUR,
    label: key,
  });

// The whole region's figure: these are the only functions in eu-south-2, and it costs one metric
// instead of three, which keeps the dashboard within the free tier's 50.
const regional = (metricName: string, label: string, statistic = 'Sum') =>
  new cw.Metric({ namespace: 'AWS/Lambda', metricName, statistic, period: HOUR, label });

// Every model the API has used, not only today's, so a model change keeps showing up.
const bedrockSearch = (metric: string, statistic: string) =>
  new cw.MathExpression({
    expression: `SEARCH('{AWS/Bedrock,ModelId} ${metric}', '${statistic}', 3600)`,
    usingMetrics: {},
    // Empty, so each series is named after its model.
    label: '',
    period: HOUR,
  });

// Tokens × list price of the configured models.
function aiCost(label: string): cw.MathExpression {
  const models = [...new Set([PRIMARY_MODEL, ESCALATION_MODEL])];
  const usingMetrics: Record<string, cw.IMetric> = {};
  const terms = models.flatMap((model, i) => {
    const price = MODEL_PRICES_USD_PER_MTOK[model];
    if (!price) throw new Error(`No price for ${model} in MODEL_PRICES_USD_PER_MTOK`);
    const tokens = (metricName: string) =>
      new cw.Metric({
        namespace: 'AWS/Bedrock',
        metricName,
        dimensionsMap: { ModelId: model },
        statistic: 'Sum',
        period: HOUR,
      });
    usingMetrics[`in${i}`] = tokens('InputTokenCount');
    usingMetrics[`out${i}`] = tokens('OutputTokenCount');
    return [`FILL(in${i}, 0) * ${price.input}`, `FILL(out${i}, 0) * ${price.output}`];
  });
  return new cw.MathExpression({
    expression: `(${terms.join(' + ')}) / 1000000`,
    usingMetrics,
    label,
    period: HOUR,
  });
}

const consoleUrl = (path: string) => `https://${REGION}.console.aws.amazon.com/${path}`;
// The console's own URL encoding for Live Tail: `*3a` is `:`, `*2f` is `/`.
const liveTail = () =>
  consoleUrl(
    `cloudwatch/home?region=${REGION}#logsV2:live-tail$3FlogGroupArns$3D~(${KEYS.map(logGroup)
      .map(
        (g) =>
          `~'arn*3aaws*3alogs*3a${REGION}*3a${Aws.ACCOUNT_ID}*3alog-group*3a${g.replaceAll('/', '*2f')}`,
      )
      .join('')})`,
  );
const logGroupPage = (group: string) =>
  consoleUrl(
    `cloudwatch/home?region=${REGION}#logsV2:log-groups/log-group/${group.replaceAll('/', '$252F')}`,
  );

function header(monthlyBudgetUsd: number, budgetName: string): cw.TextWidget {
  const daily = (monthlyBudgetUsd / 30).toFixed(2).replace('.', ',');
  const lambdaLinks = KEYS.map(
    (k) =>
      `[${k}](${consoleUrl(`lambda/home?region=${REGION}#/functions/${FUNCTION_NAMES[k]}?tab=monitoring`)})`,
  ).join(' · ');
  const logLinks = KEYS.map((k) => `[${k}](${logGroupPage(logGroup(k))})`).join(' · ');
  return new cw.TextWidget({
    width: 24,
    height: 3,
    markdown: [
      '# eslojusto.es · API',
      `[Live Tail de las tres funciones](${liveTail()}) · Logs: ${logLinks} · Lambda: ${lambdaLinks} · [Presupuesto ${budgetName}](https://console.aws.amazon.com/billing/home#/budgets) · [Cost Explorer](https://console.aws.amazon.com/costmanagement/home#/cost-explorer)`,
      '',
      `**Bien** es: ninguna alarma en rojo, 0 errores de Lambda, 0 limitaciones, 0 \`model_unavailable\`, duración p95 de extract por debajo de 60 s (la mitad de su tiempo límite) y coste IA por debajo de ${daily} USD al día (${monthlyBudgetUsd} USD al mes).`,
    ].join('\n'),
  });
}

const logQuery = (
  title: string,
  keys: FunctionKey[],
  query: string[],
  view: cw.LogQueryVisualizationType,
  width = 12,
) =>
  new cw.LogQueryWidget({
    title,
    logGroupNames: keys.map(logGroup),
    region: REGION,
    queryLines: query,
    view,
    width,
    height: 6,
  });

const flag = (name: string) => `sum(@message like /"${name}":true/)`;

export function addDashboard(
  stack: Stack,
  budget: { readonly monthlyUsd: number; readonly name: string },
  alarms: cw.IAlarm[],
): cw.Dashboard {
  const dashboard = new cw.Dashboard(stack, 'Dashboard', {
    dashboardName: DASHBOARD_NAME,
    defaultInterval: Duration.days(1),
  });

  dashboard.addWidgets(header(budget.monthlyUsd, budget.name));
  dashboard.addWidgets(
    new cw.AlarmStatusWidget({
      title: 'Alarmas (avisan por correo)',
      alarms,
      width: 24,
      height: 3,
    }),
  );

  dashboard.addWidgets(
    new cw.SingleValueWidget({
      title: 'Últimas 24 h',
      width: 24,
      height: 4,
      start: LAST_24H,
      setPeriodToTimeRange: true,
      metrics: [
        lambdaMetric('extract', 'Invocations').with({
          label: 'Lecturas (invocaciones de extract)',
        }),
        regional('Errors', 'Errores de Lambda'),
        regional('Throttles', 'Limitaciones (throttles)'),
        lambdaMetric('extract', 'Duration', 'p95').with({ label: 'Duración p95 de extract (ms)' }),
        aiCost('Coste IA estimado (USD)'),
      ],
    }),
  );

  dashboard.addWidgets(
    new cw.GraphWidget({
      title: 'Invocaciones por función',
      width: 6,
      left: KEYS.map((k) => lambdaMetric(k, 'Invocations')),
    }),
    new cw.GraphWidget({
      title: 'Errores, limitaciones y respuestas 5xx por función',
      width: 6,
      left: KEYS.flatMap((k) => [
        lambdaMetric(k, 'Errors').with({ label: `${k} errores` }),
        lambdaMetric(k, 'Throttles').with({ label: `${k} limitaciones` }),
        lambdaMetric(k, 'Url5xxCount').with({ label: `${k} 5xx` }),
      ]),
    }),
    new cw.GraphWidget({
      title: 'Duración p50 / p95 por función (ms)',
      width: 6,
      left: KEYS.flatMap((k) => [
        lambdaMetric(k, 'Duration', 'p50').with({ label: `${k} p50` }),
        lambdaMetric(k, 'Duration', 'p95').with({ label: `${k} p95` }),
      ]),
    }),
    new cw.GraphWidget({
      title: 'Ejecuciones simultáneas frente al límite de la cuenta',
      width: 6,
      left: [
        regional('ConcurrentExecutions', 'cuenta', 'Maximum').with({ period: Duration.minutes(5) }),
        ...KEYS.map((k) =>
          lambdaMetric(k, 'ConcurrentExecutions', 'Maximum').with({ period: Duration.minutes(5) }),
        ),
      ],
      leftYAxis: { min: 0 },
      leftAnnotations: [
        { value: ACCOUNT_CONCURRENCY_LIMIT, label: `límite (${ACCOUNT_CONCURRENCY_LIMIT})` },
      ],
    }),
  );

  dashboard.addWidgets(
    new cw.GraphWidget({
      title: 'Bedrock: invocaciones por modelo',
      width: 6,
      left: [bedrockSearch('MetricName="Invocations"', 'Sum')],
    }),
    new cw.GraphWidget({
      title: 'Bedrock: tokens de entrada (izq.) y salida (der.)',
      width: 6,
      left: [bedrockSearch('MetricName="InputTokenCount"', 'Sum')],
      right: [bedrockSearch('MetricName="OutputTokenCount"', 'Sum')],
    }),
    new cw.GraphWidget({
      title: 'Bedrock: latencia media por modelo (ms)',
      width: 6,
      left: [bedrockSearch('MetricName="InvocationLatency"', 'Average')],
    }),
    new cw.GraphWidget({
      title: 'Bedrock: errores y limitaciones; coste IA por hora (der., USD)',
      width: 6,
      left: [
        bedrockSearch(
          '(MetricName="InvocationClientErrors" OR MetricName="InvocationServerErrors" OR MetricName="InvocationThrottles")',
          'Sum',
        ),
      ],
      right: [aiCost('coste IA')],
    }),
  );

  const extract = 'filter op = "extract"';
  dashboard.addWidgets(
    logQuery(
      'Lecturas por resultado',
      ['extract'],
      [
        extract,
        'stats sum(code = "ok") as ok, sum(code = "captcha_failed") as captcha_failed, ' +
          'sum(code = "model_unavailable") as model_unavailable, ' +
          'sum(code = "document_too_dense") as document_too_dense, ' +
          'sum(code not in ["ok", "captcha_failed", "model_unavailable", "document_too_dense"]) as otros ' +
          'by bin(1h)',
      ],
      cw.LogQueryVisualizationType.STACKEDAREA,
    ),
    logQuery(
      'Lecturas: códigos',
      ['extract'],
      [extract, 'stats count(*) as lecturas by code', 'sort lecturas desc'],
      cw.LogQueryVisualizationType.TABLE,
      6,
    ),
    logQuery(
      'Pagos: códigos de checkout y pass',
      ['checkout', 'pass'],
      [
        'filter op in ["checkout", "pass"]',
        'stats count(*) as peticiones by op, code',
        'sort op asc, peticiones desc',
      ],
      cw.LogQueryVisualizationType.TABLE,
      6,
    ),
  );

  // A read that answers nothing_read logs how many of its pages had each readability
  // (READABILITY in src/domain/extraction-schema.ts; test/infra.test.ts keeps them equal).
  const reasons: readonly [string, string][] = [
    ['blurry', 'borrosa'],
    ['dark', 'oscura'],
    ['cropped', 'cortada'],
    ['handwritten', 'aMano'],
    ['not_labour_document', 'noLaboral'],
    ['not_rental_document', 'noAlquiler'],
    ['foreign_jurisdiction', 'otroPais'],
    ['unknown_format', 'formatoDesconocido'],
    ['ok', 'legibleSinDatos'],
  ];
  const answered = `${extract} and code in ["ok", "nothing_read"]`;
  dashboard.addWidgets(
    logQuery(
      'Lecturas sin datos por motivo (páginas por día)',
      ['extract'],
      [
        `${extract} and code = "nothing_read"`,
        `stats count(*) as lecturas, ${reasons
          .map(([reason, name]) => `sum(readability.${reason}) as ${name}`)
          .join(', ')} by bin(1d)`,
        'sort @timestamp desc',
      ],
      cw.LogQueryVisualizationType.TABLE,
      18,
    ),
    logQuery(
      '% lecturas sin datos (24 h)',
      ['extract'],
      [
        answered,
        'stats 100 * sum(code = "nothing_read") / count(*) as porcentaje, ' +
          'sum(code = "nothing_read") as sinDatos, count(*) as respondidas',
      ],
      cw.LogQueryVisualizationType.TABLE,
      6,
    ),
  );

  dashboard.addWidgets(
    logQuery(
      'Lecturas: latencia según el registro (ms)',
      ['extract'],
      [
        extract,
        'stats pct(latencyMs, 50) as p50, pct(latencyMs, 95) as p95, max(latencyMs) as maximo by bin(1h)',
      ],
      cw.LogQueryVisualizationType.LINE,
    ),
    logQuery(
      'Lecturas: escaladas, subestimadas, sin contar, recortadas y páginas',
      ['extract'],
      [
        extract,
        `stats count(*) as lecturas, ${flag('escalated')} as escaladas, ` +
          `${flag('underestimated')} as subestimadas, ${flag('countNotSaved')} as sinContar, ` +
          `${flag('truncated')} as recortadas, ` +
          'avg(pages) as paginasMedias, avg(inputTokens) as tokensEntrada, ' +
          'avg(outputTokens) as tokensSalida',
      ],
      cw.LogQueryVisualizationType.TABLE,
    ),
  );

  return dashboard;
}
