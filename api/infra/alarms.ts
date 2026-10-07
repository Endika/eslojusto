import { Duration, type Stack } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { FUNCTION_NAMES, PRIMARY_MODEL } from '../src/config';

export const ALERTS_TOPIC_NAME = 'eslojusto-api-alerts';
export const ALARM_PREFIX = 'eslojusto-api-';
export const METRIC_NAMESPACE = 'Eslojusto/Api';

type FunctionKey = keyof typeof FUNCTION_NAMES;

const lambda = (key: FunctionKey, metricName: string, period: Duration) =>
  new cw.Metric({
    namespace: 'AWS/Lambda',
    metricName,
    dimensionsMap: { FunctionName: FUNCTION_NAMES[key] },
    statistic: 'Sum',
    period,
  });

// Each alarm emails on ALARM and on OK, so the recovery arrives too. A function URL counts the
// function's own 503s (model_unavailable, payment_provider_unavailable, service_unavailable) in
// Url5xxCount, which is free; Lambda Errors only counts crashes and timeouts.
export function addAlarms(
  stack: Stack,
  extractLogGroup: logs.ILogGroup,
  alertEmail: string | undefined,
): cw.Alarm[] {
  const topic = new sns.Topic(stack, 'Alerts', { topicName: ALERTS_TOPIC_NAME });
  if (alertEmail) topic.addSubscription(new EmailSubscription(alertEmail));
  const action = new SnsAction(topic);

  // The one custom metric: nothing free counts successful reads. Published only in hours with a
  // successful read, so it bills only for those hours.
  const okFilter = new logs.MetricFilter(stack, 'ExtractOkFilter', {
    logGroup: extractLogGroup,
    filterPattern: logs.FilterPattern.literal('{ $.op = "extract" && $.code = "ok" }'),
    metricNamespace: METRIC_NAMESPACE,
    metricName: 'ExtractOk',
    metricValue: '1',
  });

  const alarm = (
    name: string,
    description: string,
    metric: cw.IMetric,
    threshold: number,
  ): cw.Alarm => {
    const a = new cw.Alarm(stack, `${name}Alarm`, {
      alarmName: `${ALARM_PREFIX}${name}`,
      alarmDescription: description,
      metric,
      threshold,
      evaluationPeriods: 1,
      comparisonOperator: cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cw.TreatMissingData.NOT_BREACHING,
    });
    a.addAlarmAction(action);
    a.addOkAction(action);
    return a;
  };

  const quarter = Duration.minutes(15);
  const hour = Duration.hours(1);
  return [
    alarm(
      'payments-errors',
      'checkout o pass ha fallado 2 o más veces en 15 min (errores de Lambda o respuestas 5xx): hay clientes que no pueden pagar o recoger su pase.',
      new cw.MathExpression({
        expression:
          'FILL(checkoutErrors, 0) + FILL(passErrors, 0) + FILL(checkout5xx, 0) + FILL(pass5xx, 0)',
        usingMetrics: {
          checkoutErrors: lambda('checkout', 'Errors', quarter),
          passErrors: lambda('pass', 'Errors', quarter),
          checkout5xx: lambda('checkout', 'Url5xxCount', quarter),
          pass5xx: lambda('pass', 'Url5xxCount', quarter),
        },
        period: quarter,
        label: 'fallos de checkout y pass',
      }),
      2,
    ),
    alarm(
      'extract-errors',
      'extract ha fallado 3 o más veces en 15 min (excepción o tiempo agotado).',
      lambda('extract', 'Errors', quarter),
      3,
    ),
    alarm(
      'extract-5xx',
      'extract ha respondido 3 o más 503 en 30 min: model_unavailable o service_unavailable.',
      lambda('extract', 'Url5xxCount', Duration.minutes(30)),
      3,
    ),
    alarm(
      'extract-no-success',
      'Ninguna lectura ha salido bien en 1 h aunque el modelo principal se ha llamado 5 o más veces.',
      new cw.MathExpression({
        expression: 'IF(FILL(attempts, 0) >= 5 AND FILL(ok, 0) == 0, 1, 0)',
        usingMetrics: {
          attempts: new cw.Metric({
            namespace: 'AWS/Bedrock',
            metricName: 'Invocations',
            dimensionsMap: { ModelId: PRIMARY_MODEL },
            statistic: 'Sum',
            period: hour,
          }),
          ok: okFilter.metric({ statistic: 'Sum', period: hour }),
        },
        period: hour,
        label: 'lecturas sin éxito',
      }),
      1,
    ),
    alarm(
      'throttles',
      'Lambda ha rechazado al menos una invocación por concurrencia en 5 min (el límite de la cuenta es 10).',
      new cw.Metric({
        namespace: 'AWS/Lambda',
        metricName: 'Throttles',
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      1,
    ),
  ];
}
