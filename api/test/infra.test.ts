import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import {
  ESCALATION_MODEL,
  EU_PROFILE_DESTINATIONS,
  EXTRACT_TIMEOUT_SECONDS,
  FUNCTION_NAMES,
  PARAMETER_NAMES,
  PRIMARY_MODEL,
  REGION,
} from '../src/config';
import { buildApp, GLOBAL_STACK_REGION } from '../infra/stacks';
import { NO_ESCALATION_AFTER_MS, READ_DEADLINE_MS } from '../src/domain/extract';

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

  it('holds only functions, their URLs and their log groups: no storage, no IAM', () => {
    expect(types(apiTemplate)).toEqual([
      'AWS::Lambda::Function',
      'AWS::Lambda::Permission',
      'AWS::Lambda::Url',
      'AWS::Logs::LogGroup',
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

  it('lets CloudFormation manage the API dashboard and no other', () => {
    const [policy] = Object.values(
      globalTemplate.findResources('AWS::IAM::ManagedPolicy', {
        Properties: { ManagedPolicyName: 'eslojusto-api-cfn-execution' },
      }),
    ) as { Properties: { PolicyDocument: { Statement: Record<string, unknown>[] } } }[];
    const cloudwatch = (policy?.Properties.PolicyDocument.Statement ?? []).filter((s) =>
      JSON.stringify(s['Action']).includes('cloudwatch:'),
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
