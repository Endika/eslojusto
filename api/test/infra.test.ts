import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  ESCALATION_MODEL,
  EU_PROFILE_DESTINATIONS,
  EXTRACT_TIMEOUT_SECONDS,
  FUNCTION_NAMES,
  MODEL_PRICES_USD_PER_MTOK,
  PARAMETER_NAMES,
  PRIMARY_MODEL,
  REGION,
} from '../src/config';
import { buildApp, GLOBAL_STACK_REGION } from '../infra/stacks';
import { NO_ESCALATION_AFTER_MS, READ_DEADLINE_MS } from '../src/domain/extract';
import { ALL_READABILITY, READABILITY } from '../src/domain/extraction-schema';
import { REVIEWS } from '../src/domain/reviews';

const { api, global } = buildApp(
  { stripePriceId: 'price_test', alertEmail: 'alerts@example.com' },
  new App({ context: { 'aws:cdk:bundling-stacks': [] } }),
);
if (!global) throw new Error('The global stack needs an alert email');
const apiTemplate = Template.fromStack(api);
const globalTemplate = Template.fromStack(global);

const types = (t: Template) =>
  [
    ...new Set(
      Object.values(t.toJSON()['Resources'] as Record<string, { Type: string }>).map((r) => r.Type),
    ),
  ].sort();

// Every string in the template that looks like a region.
const regions = (t: Template) =>
  new Set(JSON.stringify(t.toJSON()).match(/\b(?:[a-z]{2}-(?:gov-)?[a-z]+-\d)\b/g) ?? []);

const statements = (t: Template, roleName: string) => {
  const roles = t.findResources('AWS::IAM::Role', { Properties: { RoleName: roleName } });
  const [role] = Object.values(roles) as {
    Properties: { Policies: { PolicyDocument: { Statement: Record<string, unknown>[] } }[] };
  }[];
  return role?.Properties.Policies.flatMap((p) => p.PolicyDocument.Statement) ?? [];
};

describe('regional stack', () => {
  it('lives in eu-south-2 and names no other region', () => {
    expect(api.region).toBe(REGION);
    for (const region of regions(apiTemplate)) expect(region).toBe(REGION);
  });

  it('holds only functions, their URLs, logs, the dashboard and alerts: no storage, no IAM', () => {
    expect(types(apiTemplate)).toEqual([
      'AWS::CloudWatch::Alarm',
      'AWS::CloudWatch::Dashboard',
      'AWS::Lambda::Function',
      'AWS::Lambda::Permission',
      'AWS::Lambda::Url',
      'AWS::Logs::LogGroup',
      'AWS::Logs::MetricFilter',
      'AWS::SNS::Subscription',
      'AWS::SNS::Topic',
    ]);
    apiTemplate.resourceCountIs('AWS::S3::Bucket', 0);
    apiTemplate.resourceCountIs('AWS::DynamoDB::Table', 0);
    apiTemplate.resourceCountIs('AWS::DynamoDB::GlobalTable', 0);
  });

  it('runs three arm64 functions on Node 24, capped at 5 + 2 + 2 concurrent runs', () => {
    apiTemplate.resourceCountIs('AWS::Lambda::Function', 3);
    apiTemplate.allResourcesProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs24.x',
      Architectures: ['arm64'],
    });
    apiTemplate.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'eslojusto-api-extract',
      ReservedConcurrentExecutions: 5,
      Environment: Match.absent(),
    });
    for (const fn of ['checkout', 'pass'])
      apiTemplate.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: `eslojusto-api-${fn}`,
        ReservedConcurrentExecutions: 2,
        Environment: { Variables: { STRIPE_PRICE_ID: 'price_test' } },
      });
  });

  it('reserves nothing when told the account quota is too low', () => {
    const unreserved = Template.fromStack(
      buildApp({ stripePriceId: 'price_test', reserveConcurrency: false }, new App()).api,
    );
    unreserved.resourceCountIs('AWS::Lambda::Function', 3);
    unreserved.allResourcesProperties('AWS::Lambda::Function', {
      ReservedConcurrentExecutions: Match.absent(),
    });
  });

  it('opens each function URL to the site only, for POST', () => {
    apiTemplate.resourceCountIs('AWS::Lambda::Url', 3);
    apiTemplate.allResourcesProperties('AWS::Lambda::Url', {
      AuthType: 'NONE',
      Cors: { AllowOrigins: ['https://eslojusto.es'], AllowMethods: ['POST'] },
    });
  });

  it('exposes each function URL as its own output', () => {
    const outputs = apiTemplate.toJSON()['Outputs'] as Record<string, { Value: unknown }>;
    expect(Object.keys(outputs).sort()).toEqual(['checkoutUrl', 'extractUrl', 'passUrl']);
    for (const fn of ['extract', 'checkout', 'pass'])
      expect(JSON.stringify(outputs[`${fn}Url`]?.Value)).toMatch(new RegExp(`${fn}FunctionUrl`));
  });

  it('keeps logs for two weeks', () => {
    apiTemplate.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 14 });
  });
});

describe('dashboard', () => {
  const dashboards = Object.values(apiTemplate.findResources('AWS::CloudWatch::Dashboard')) as {
    Properties: { DashboardName: string; DashboardBody: { 'Fn::Join': [string, unknown[]] } };
  }[];
  const [dashboard] = dashboards;
  const body = (dashboard?.Properties.DashboardBody['Fn::Join'][1] ?? [])
    .map((part) => (typeof part === 'string' ? part : 'TOKEN'))
    .join('');
  const widgets = (
    JSON.parse(body) as { widgets: { type: string; properties: Record<string, unknown> }[] }
  ).widgets;
  const queries = widgets.filter((w) => w.type === 'log').map((w) => String(w.properties['query']));

  it('is the one eslojusto-api dashboard, in the regional stack', () => {
    expect(dashboards).toHaveLength(1);
    expect(dashboard?.Properties.DashboardName).toBe('eslojusto-api');
    expect(api.region).toBe(REGION);
    for (const w of widgets.filter((w) => w.type === 'log'))
      expect(w.properties['region']).toBe(REGION);
  });

  it('queries all three log groups inline, with no saved queries', () => {
    for (const fn of ['extract', 'checkout', 'pass'])
      expect(queries.join('\n')).toContain(`SOURCE '/aws/lambda/eslojusto-api-${fn}'`);
    apiTemplate.resourceCountIs('AWS::Logs::QueryDefinition', 0);
  });

  it('follows Bedrock by model id, whatever the model', () => {
    expect(body).toContain(`SEARCH('{AWS/Bedrock,ModelId}`);
  });

  it('prices the configured models from the config', () => {
    for (const model of [PRIMARY_MODEL, ESCALATION_MODEL]) {
      const price = MODEL_PRICES_USD_PER_MTOK[model];
      expect(price).toBeDefined();
      expect(body).toContain(model);
      expect(body).toContain(`* ${price?.input}`);
      expect(body).toContain(`* ${price?.output}`);
    }
  });

  it('charts only free AWS metrics, never the custom one', () => {
    // A metric row starts with its namespace; an expression names one only inside SEARCH.
    const namespaces = new Set(
      widgets.flatMap((w) =>
        ((w.properties['metrics'] ?? []) as [unknown][]).flatMap(([first]) =>
          typeof first === 'string'
            ? [first]
            : [...String((first as { expression: string }).expression).matchAll(/\{([^,}]+)/g)].map(
                (m) => m[1],
              ),
        ),
      ),
    );
    expect(namespaces).toEqual(new Set(['AWS/Bedrock', 'AWS/Lambda']));
  });

  it('counts reads with nothing read per day by every reason, and their share', () => {
    const byReason = queries.find((q) => q.includes('code = "nothing_read"'));
    for (const reason of READABILITY) expect(byReason).toContain(`sum(readability.${reason}) as`);
    expect(byReason).toContain('by bin(1d)');
    const share = queries.find((q) => q.includes('code in ["ok", "nothing_read"]'));
    expect(share).toContain('100 * sum(code = "nothing_read") / count(*) as porcentaje');
    const titles = widgets.map((w) => w.properties['title']);
    expect(titles).toContain('Lecturas sin datos por motivo (páginas por día)');
    expect(titles).toContain('% lecturas sin datos (24 h)');
  });

  it('counts the reads whose lists came back at their maximum', () => {
    const flags = queries.find((q) => q.includes('as escaladas'));
    expect(flags).toContain('sum(@message like /"truncated":true/) as recortadas');
  });

  const byTitle = (title: string) => {
    const widget = widgets.find((w) => w.properties['title'] === title);
    if (!widget) throw new Error(`No widget ${title}`);
    return String(widget.properties['query']);
  };

  it('counts reads and their results per review, the final pay where the log names none', () => {
    const perHour = byTitle('Lecturas por revisión (por hora)');
    expect(perHour).toContain('coalesce(review, "final_pay") as revision');
    for (const review of REVIEWS) expect(perHour).toContain(`sum(revision = "${review}") as`);
    expect(byTitle('Lecturas por revisión: resultados')).toContain('as sinDatos');
  });

  it('counts reads with nothing read by review, every reason, and their share', () => {
    const byReason = byTitle('Lecturas sin datos por revisión y motivo (páginas)');
    for (const reason of READABILITY) expect(byReason).toContain(`sum(readability.${reason}) as`);
    expect(byReason).toContain('by revision');
    expect(byTitle('% lecturas sin datos por revisión')).toContain(
      '100 * sum(code = "nothing_read") / count(*) as porcentaje',
    );
  });

  it('counts the reasons only the credit and the insurance review give too', () => {
    const byReason = byTitle('Lecturas sin datos por revisión y motivo (páginas)');
    for (const reason of ALL_READABILITY)
      expect(byReason).toContain(`sum(readability.${reason}) as`);
  });

  it('counts conflicts and escalations per review, and truncated employment lists', () => {
    const flags = byTitle('Conflictos y escalados por revisión');
    expect(flags).toContain('sum(conflicts) as conflictos');
    expect(flags).toContain('sum(@message like /"escalated":true/) as escaladas');
    const truncated = byTitle('Contrato: lecturas con listas recortadas (por día)');
    expect(truncated).toContain('review = "employment"');
    expect(truncated).toContain('sum(@message like /"truncated":true/) as recortadas');
  });

  it('charts p95 tokens and prices each review’s reads from the config', () => {
    const tokens = byTitle('Tokens p95 por revisión');
    expect(tokens).toContain('pct(inputTokens, 95)');
    expect(tokens).toContain('pct(outputTokens, 95)');
    const cost = byTitle('Coste IA por lectura y revisión (USD)');
    const prices = [PRIMARY_MODEL, ESCALATION_MODEL].map((m) => MODEL_PRICES_USD_PER_MTOK[m]);
    expect(cost).toContain(
      `sum(inputTokens) * ${Math.max(...prices.map((p) => p?.input ?? 0))} / 1000000 / count(*)`,
    );
    expect(cost).toContain(
      `sum(outputTokens) * ${Math.max(...prices.map((p) => p?.output ?? 0))} / 1000000 / count(*)`,
    );
    expect(cost).toContain('as costePorLectura by revision');
  });

  it('stays within the free tier of 50 metrics per dashboard, with room for two models', () => {
    const rows = widgets.flatMap((w) => (w.properties['metrics'] ?? []) as unknown[]);
    const searches = body.match(/SEARCH\(/g) ?? [];
    expect(rows.length + searches.length).toBeLessThanOrEqual(50);
  });
});

describe('alerts', () => {
  const alarms = Object.values(apiTemplate.findResources('AWS::CloudWatch::Alarm')) as {
    Properties: Record<string, unknown> & { AlarmName: string };
  }[];
  const byName = (name: string) => {
    const alarm = alarms.find((a) => a.Properties.AlarmName === `eslojusto-api-${name}`);
    if (!alarm) throw new Error(`No alarm ${name}`);
    return alarm.Properties;
  };
  const topicRef = { Ref: Object.keys(apiTemplate.findResources('AWS::SNS::Topic'))[0] };

  it('emails one address through the eslojusto-api-alerts topic', () => {
    apiTemplate.resourceCountIs('AWS::SNS::Topic', 1);
    apiTemplate.hasResourceProperties('AWS::SNS::Topic', { TopicName: 'eslojusto-api-alerts' });
    apiTemplate.resourceCountIs('AWS::SNS::Subscription', 1);
    apiTemplate.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.com',
      TopicArn: topicRef,
    });
  });

  it('keeps the topic without subscribers when no address is given', () => {
    const quiet = Template.fromStack(
      buildApp(
        { stripePriceId: 'price_test' },
        new App({ context: { 'aws:cdk:bundling-stacks': [] } }),
      ).api,
    );
    quiet.resourceCountIs('AWS::SNS::Topic', 1);
    quiet.resourceCountIs('AWS::SNS::Subscription', 0);
    quiet.resourceCountIs('AWS::CloudWatch::Alarm', 7);
  });

  it('raises seven standard alarms that email on trouble and on recovery', () => {
    expect(alarms.map((a) => a.Properties.AlarmName).sort()).toEqual(
      [
        'employment-unread-share',
        'extract-5xx',
        'extract-errors',
        'extract-no-success',
        'payments-errors',
        'rental-unread-share',
        'throttles',
      ].map((n) => `eslojusto-api-${n}`),
    );
    for (const { Properties: p } of alarms) {
      expect(p['AlarmActions']).toEqual([topicRef]);
      expect(p['OKActions']).toEqual([topicRef]);
      expect(p['TreatMissingData']).toBe('notBreaching');
      expect(p['ComparisonOperator']).toBe(
        p.AlarmName.endsWith('-unread-share')
          ? 'GreaterThanThreshold'
          : 'GreaterThanOrEqualToThreshold',
      );
      expect(p['EvaluationPeriods']).toBe(1);
    }
  });

  // CloudWatch's free tier covers 10 alarm metrics; a metric-math alarm counts each metric. The
  // two beta alarms take it to 13: 0.30 USD a month over the free tier.
  it('keeps to 13 alarm metrics', () => {
    const count = alarms.reduce((n, { Properties: p }) => {
      const metrics = p['Metrics'] as { MetricStat?: unknown }[] | undefined;
      return n + (metrics ? metrics.filter((m) => m.MetricStat).length : 1);
    }, 0);
    expect(count).toBeLessThanOrEqual(13);
  });

  it.each([
    ['rental', 'Rental'],
    ['employment', 'Employment'],
  ])('%s beta: over 40%% of 5 or more answered reads in 6 h with nothing read', (review, id) => {
    const p = byName(`${review}-unread-share`);
    expect(p['Threshold']).toBe(40);
    const json = JSON.stringify(p['Metrics']);
    expect(json).toContain('IF(FILL(answered, 0) >= 5, 100 * FILL(unread, 0) / answered, 0)');
    expect(json).toContain(`"MetricName":"${id}Answered"`);
    expect(json).toContain('"Stat":"SampleCount"');
    expect(json).toContain('"Stat":"Sum"');
    expect(json).toContain('"Period":21600');
    for (const [code, value] of [
      ['nothing_read', '1'],
      ['ok', '0'],
    ])
      apiTemplate.hasResourceProperties('AWS::Logs::MetricFilter', {
        FilterPattern: `{ $.op = "extract" && $.review = "${review}" && $.code = "${code}" }`,
        MetricTransformations: [
          { MetricNamespace: 'Eslojusto/Api', MetricName: `${id}Answered`, MetricValue: value },
        ],
      });
  });

  it.each([
    ['extract-errors', 3, 900, 'Errors', 'eslojusto-api-extract'],
    ['extract-5xx', 3, 1800, 'Url5xxCount', 'eslojusto-api-extract'],
  ])('%s: %i or more in %i s', (name, threshold, period, metricName, fn) => {
    expect(byName(name)).toMatchObject({
      Threshold: threshold,
      Period: period,
      Statistic: 'Sum',
      Namespace: 'AWS/Lambda',
      MetricName: metricName,
      Dimensions: [{ Name: 'FunctionName', Value: fn }],
    });
  });

  it('throttles: 1 or more on any function in 5 min', () => {
    expect(byName('throttles')).toMatchObject({
      Threshold: 1,
      Period: 300,
      Namespace: 'AWS/Lambda',
      MetricName: 'Throttles',
    });
    expect(byName('throttles')['Dimensions']).toBeUndefined();
  });

  it('payments: 2 or more errors or 5xx across checkout and pass in 15 min', () => {
    const p = byName('payments-errors');
    expect(p['Threshold']).toBe(2);
    const stats = (
      p['Metrics'] as {
        MetricStat?: {
          Metric: { MetricName: string; Dimensions: { Value: string }[] };
          Period: number;
        };
      }[]
    ).flatMap((m) => (m.MetricStat ? [m.MetricStat] : []));
    expect(
      stats
        .map((m) => `${m.Metric.Dimensions[0]?.Value} ${m.Metric.MetricName} ${m.Period}`)
        .sort(),
    ).toEqual([
      'eslojusto-api-checkout Errors 900',
      'eslojusto-api-checkout Url5xxCount 900',
      'eslojusto-api-pass Errors 900',
      'eslojusto-api-pass Url5xxCount 900',
    ]);
  });

  it('no success: 5 or more primary-model calls in an hour and no ok read', () => {
    const p = byName('extract-no-success');
    expect(p['Threshold']).toBe(1);
    const json = JSON.stringify(p['Metrics']);
    expect(json).toContain('IF(FILL(attempts, 0) >= 5 AND FILL(ok, 0) == 0, 1, 0)');
    expect(json).toContain(PRIMARY_MODEL);
    expect(json).toContain('"MetricName":"ExtractOk"');
    expect(json).toContain('"Period":3600');
  });

  it('adds a metric filter for successful reads, and two per beta review', () => {
    apiTemplate.resourceCountIs('AWS::Logs::MetricFilter', 5);
    apiTemplate.hasResourceProperties('AWS::Logs::MetricFilter', {
      FilterPattern: '{ $.op = "extract" && $.code = "ok" }',
      MetricTransformations: [
        { MetricNamespace: 'Eslojusto/Api', MetricName: 'ExtractOk', MetricValue: '1' },
      ],
    });
  });
});

it('leaves the global stack out of an app without an alert email', () => {
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  expect(buildApp({ stripePriceId: 'price_test' }, app).global).toBeUndefined();
  expect(app.node.children.map((c) => c.node.id)).toEqual(['EslojustoApi']);
});

describe('global stack', () => {
  it('holds only global resources', () => {
    expect(global.region).toBe(GLOBAL_STACK_REGION);
    expect(types(globalTemplate)).toEqual([
      'AWS::Budgets::Budget',
      'AWS::Budgets::BudgetsAction',
      'AWS::IAM::ManagedPolicy',
      'AWS::IAM::OIDCProvider',
      'AWS::IAM::Role',
    ]);
  });

  it('gives extract the time its reads may take, and room to answer after them', () => {
    const functions = Object.values(apiTemplate.findResources('AWS::Lambda::Function')) as {
      Properties: { FunctionName: string; Timeout: number };
    }[];
    const extract = functions.find((f) => f.Properties.FunctionName === FUNCTION_NAMES.extract);
    expect(extract?.Properties.Timeout).toBe(EXTRACT_TIMEOUT_SECONDS);
    expect(EXTRACT_TIMEOUT_SECONDS * 1000).toBeGreaterThanOrEqual(READ_DEADLINE_MS + 15_000);
    expect(NO_ESCALATION_AFTER_MS).toBeLessThan(READ_DEADLINE_MS);
  });

  it('points only at EU regions', () => {
    for (const region of regions(globalTemplate))
      expect([...EU_PROFILE_DESTINATIONS, GLOBAL_STACK_REGION]).toContain(region);
  });

  it('lets the extractor invoke only the configured EU profiles and their models through them', () => {
    const bedrock = statements(globalTemplate, 'eslojusto-api-extract').filter((s) =>
      String(s['Action']).startsWith('bedrock:'),
    );
    expect(bedrock.map((s) => s['Action'])).toEqual(['bedrock:InvokeModel', 'bedrock:InvokeModel']);
    const json = JSON.stringify(bedrock);
    for (const model of [PRIMARY_MODEL, ESCALATION_MODEL]) {
      expect(json).toContain(`inference-profile/${model}`);
      for (const region of EU_PROFILE_DESTINATIONS)
        expect(json).toContain(`arn:aws:bedrock:${region}::foundation-model/${model.slice(3)}`);
    }
    expect(json).not.toMatch(/"\*"|global\.|us\.|apac\./);
    // Sonnet reads alone, so the role reaches no other model.
    expect(json).not.toContain('haiku');
    expect(bedrock[1]?.['Condition']).toHaveProperty([
      'StringEquals',
      'bedrock:InferenceProfileArn',
    ]);
  });

  it.each([
    [
      'extract',
      [
        PARAMETER_NAMES.tokenKey,
        PARAMETER_NAMES.turnstileSecretKey,
        PARAMETER_NAMES.stripeRestrictedKey,
      ],
    ],
    ['checkout', [PARAMETER_NAMES.stripeRestrictedKey, PARAMETER_NAMES.turnstileSecretKey]],
    ['pass', [PARAMETER_NAMES.stripeRestrictedKey, PARAMETER_NAMES.tokenKey]],
  ])('lets %s read only its parameters, and never Bedrock elsewhere', (fn, params) => {
    const all = statements(globalTemplate, `eslojusto-api-${fn}`);
    const ssm = all.filter((s) => String(s['Action']).startsWith('ssm:'));
    expect(ssm.map((s) => s['Action'])).toEqual(['ssm:GetParameter']);
    const json = JSON.stringify(ssm);
    for (const p of params) expect(json).toContain(`parameter${p}`);
    expect(JSON.stringify(ssm[0]?.['Resource'])).toMatch(
      new RegExp(`(parameter/eslojusto/api/.*){${params.length}}`),
    );
    if (fn !== 'extract') expect(JSON.stringify(all)).not.toContain('bedrock');
  });

  it.each(['extract', 'checkout', 'pass'])('lets %s write only to its own log group', (fn) => {
    const logs = statements(globalTemplate, `eslojusto-api-${fn}`).filter((s) =>
      JSON.stringify(s['Action']).includes('logs:'),
    );
    const json = JSON.stringify(logs);
    expect(json).toContain(`log-group:/aws/lambda/eslojusto-api-${fn}"`);
    expect(json).toContain(`log-group:/aws/lambda/eslojusto-api-${fn}:*"`);
    expect(json.match(/log-group:/g)).toHaveLength(2);
  });

  it('hands every function the restricted Stripe key and none the full secret key', () => {
    const json = JSON.stringify(globalTemplate.toJSON());
    expect(json).not.toMatch(/stripe-secret-key/);
    for (const fn of ['extract', 'checkout', 'pass'])
      expect(JSON.stringify(statements(globalTemplate, `eslojusto-api-${fn}`))).toContain(
        `parameter${PARAMETER_NAMES.stripeRestrictedKey}`,
      );
  });

  it('budgets 10 USD a month with alerts at 50, 80 and 100%', () => {
    globalTemplate.hasResourceProperties('AWS::Budgets::Budget', {
      Budget: { BudgetLimit: { Amount: 10, Unit: 'USD' }, TimeUnit: 'MONTHLY', BudgetType: 'COST' },
      NotificationsWithSubscribers: [50, 80, 100].map((threshold) => ({
        Notification: Match.objectLike({ Threshold: threshold, NotificationType: 'ACTUAL' }),
        Subscribers: [{ SubscriptionType: 'EMAIL', Address: 'alerts@example.com' }],
      })),
    });
  });

  it('denies Bedrock to the extractor automatically at 100%', () => {
    globalTemplate.hasResourceProperties('AWS::Budgets::BudgetsAction', {
      ActionType: 'APPLY_IAM_POLICY',
      ActionThreshold: { Type: 'PERCENTAGE', Value: 100 },
      ApprovalModel: 'AUTOMATIC',
      Definition: { IamActionDefinition: { Roles: ['eslojusto-api-extract'] } },
    });
    globalTemplate.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'eslojusto-api-budget-action',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Principal: { Service: 'budgets.amazonaws.com' },
            Condition: { StringEquals: { 'aws:SourceAccount': { Ref: 'AWS::AccountId' } } },
          }),
        ],
      },
    });
    globalTemplate.hasResourceProperties('AWS::IAM::ManagedPolicy', {
      ManagedPolicyName: 'eslojusto-api-deny-bedrock',
      PolicyDocument: {
        Statement: [
          Match.objectLike({
            Effect: 'Deny',
            Action: Match.arrayWith(['bedrock:InvokeModel']),
            Resource: '*',
          }),
        ],
      },
    });
  });

  it('trusts GitHub only from the protected production environment of this repository', () => {
    globalTemplate.hasResourceProperties('AWS::IAM::Role', {
      RoleName: 'eslojusto-github-deploy',
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub':
                  'repo:Endika@568585/eslojusto@1407967362:environment:production',
              },
            },
          }),
        ],
      },
    });
    const deploy = JSON.stringify(statements(globalTemplate, 'eslojusto-github-deploy'));
    expect(deploy).toContain('sts:AssumeRole');
    expect(deploy).not.toMatch(/iam:Create|iam:Put|iam:Attach|"\*"/);
  });

  it('lets CloudFormation touch only this API’s functions, logs and roles on CI’s behalf', () => {
    const policies = globalTemplate.findResources('AWS::IAM::ManagedPolicy', {
      Properties: { ManagedPolicyName: 'eslojusto-api-cfn-execution' },
    });
    const json = JSON.stringify(policies);
    expect(json).toContain('function:eslojusto-api-');
    expect(json).toContain('iam:PassRole');
    expect(json).toContain('parameter/cdk-bootstrap/hnb659fds/version');
    expect(json).not.toMatch(
      /iam:Create|iam:Put|iam:Attach|bedrock|budgets|ssm:GetParameter"|ssm:\*/,
    );
  });

  it('lets CloudFormation manage only the alerts topic and the API alarms', () => {
    const json = JSON.stringify(
      globalTemplate.findResources('AWS::IAM::ManagedPolicy', {
        Properties: { ManagedPolicyName: 'eslojusto-api-cfn-execution' },
      }),
    );
    expect(json).toContain(':eslojusto-api-alerts"');
    expect(json).toContain(':eslojusto-api-alerts:*"');
    expect(json).toContain(':alarm:eslojusto-api-*"');
    expect(json).toContain('cloudwatch:PutMetricAlarm');
    expect(json).toContain('sns:Subscribe');
    expect(json).not.toMatch(/sns:\*|cloudwatch:\*|sns:Publish|iam:PassRole[^}]*sns/);
    expect(json.match(/arn:aws:sns:/g)).toHaveLength(2);
    expect(json.match(/:alarm:/g)).toHaveLength(1);
  });

  it('lets CloudFormation manage the API dashboard and no other', () => {
    const [policy] = Object.values(
      globalTemplate.findResources('AWS::IAM::ManagedPolicy', {
        Properties: { ManagedPolicyName: 'eslojusto-api-cfn-execution' },
      }),
    ) as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }[];
    const cloudwatch = (policy?.Properties.PolicyDocument.Statement ?? []).filter((s) =>
      JSON.stringify(s['Action']).includes('Dashboard'),
    );
    expect(cloudwatch).toHaveLength(1);
    expect(cloudwatch[0]?.['Action']).toEqual([
      'cloudwatch:PutDashboard',
      'cloudwatch:GetDashboard',
      'cloudwatch:DeleteDashboards',
      'cloudwatch:TagResource',
      'cloudwatch:UntagResource',
      'cloudwatch:ListTagsForResource',
    ]);
    expect(cloudwatch[0]?.['Resource']).toEqual({
      'Fn::Join': [
        '',
        ['arn:aws:cloudwatch::', { Ref: 'AWS::AccountId' }, ':dashboard/eslojusto-api'],
      ],
    });
  });
});
