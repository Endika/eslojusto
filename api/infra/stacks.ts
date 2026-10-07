import { fileURLToPath } from 'node:url';
import {
  App,
  BootstraplessSynthesizer,
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
} from 'aws-cdk-lib';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';
import {
  ESCALATION_MODEL,
  EU_PROFILE_DESTINATIONS,
  FUNCTION_NAMES,
  PARAMETER_NAMES,
  PRIMARY_MODEL,
  REGION,
  ROLE_NAMES,
  SITE_ORIGIN,
  STRIPE_PRICE_ENV,
  foundationModelId,
} from '../src/config';

// CloudFormation in eu-south-2 has no AWS::Budgets::* types; this stack holds only global
// resources (IAM, Budgets), so the region it is deployed through stores nothing.
export const GLOBAL_STACK_REGION = 'eu-west-1';
export const MONTHLY_BUDGET_USD = 10;
export const BUDGET_ALERT_PERCENTAGES = [50, 80, 100] as const;
export const GITHUB_REPOSITORY = 'Endika/eslojusto';
export const GITHUB_ENVIRONMENT = 'production';
export const DEPLOY_ROLE_NAME = 'eslojusto-github-deploy';
export const CFN_EXECUTION_POLICY_NAME = 'eslojusto-api-cfn-execution';
export const DENY_BEDROCK_POLICY_NAME = 'eslojusto-api-deny-bedrock';
export const BUDGET_NAME = 'eslojusto-api-monthly';
const CDK_QUALIFIER = 'hnb659fds';
const EXTRACT_RESERVED_CONCURRENCY = 5;

type FunctionKey = keyof typeof FUNCTION_NAMES;

const FUNCTIONS: Readonly<
  Record<FunctionKey, { memorySize: number; timeout: Duration; reserved?: number }>
> = {
  // Room for a primary read plus an escalated one on a 4-page PDF.
  extract: {
    memorySize: 512,
    timeout: Duration.seconds(120),
    reserved: EXTRACT_RESERVED_CONCURRENCY,
  },
  checkout: { memorySize: 256, timeout: Duration.seconds(15) },
  pass: { memorySize: 256, timeout: Duration.seconds(15) },
};

const entry = (key: FunctionKey): string =>
  fileURLToPath(new URL(`../src/handlers/${key}.ts`, import.meta.url));
const TSCONFIG = fileURLToPath(new URL('../tsconfig.json', import.meta.url));

export interface ApiStackProps extends StackProps {
  readonly stripePriceId: string;
}

// Everything regional, in eu-south-2. No IAM: the roles live in the global stack, so the CI
// deployment can neither create roles nor widen their permissions.
export class ApiStack extends Stack {
  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, { ...props, env: { ...props.env, region: REGION } });

    for (const key of Object.keys(FUNCTIONS) as FunctionKey[]) {
      const settings = FUNCTIONS[key];
      const functionName = FUNCTION_NAMES[key];
      const logGroup = new logs.LogGroup(this, `${key}Logs`, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: logs.RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.DESTROY,
      });
      const fn = new NodejsFunction(this, key, {
        functionName,
        entry: entry(key),
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_24_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: settings.memorySize,
        timeout: settings.timeout,
        role: iam.Role.fromRoleName(this, `${key}Role`, ROLE_NAMES[key], { mutable: false }),
        logGroup,
        reservedConcurrentExecutions: settings.reserved,
        environment: key === 'extract' ? {} : { [STRIPE_PRICE_ENV]: props.stripePriceId },
        bundling: {
          format: OutputFormat.ESM,
          target: 'node24',
          tsconfig: TSCONFIG,
          minify: true,
          sourceMap: false,
          mainFields: ['module', 'main'],
          banner:
            "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
        },
      });
      const url = fn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.NONE,
        cors: {
          allowedOrigins: [SITE_ORIGIN],
          allowedMethods: [lambda.HttpMethod.POST],
          allowedHeaders: ['content-type'],
          maxAge: Duration.days(1),
        },
      });
      new CfnOutput(this, `${key}Url`, { value: url.url });
    }
  }
}

export interface GlobalStackProps extends StackProps {
  readonly alertEmail: string;
}

// IAM and Budgets: global services, deployed once by hand and reviewed, never by CI.
export class GlobalStack extends Stack {
  constructor(scope: Construct, id: string, props: GlobalStackProps) {
    super(scope, id, {
      ...props,
      env: { ...props.env, region: GLOBAL_STACK_REGION },
      synthesizer: new BootstraplessSynthesizer(),
    });
    const account = Stack.of(this).account;
    const regional = (service: string, resource: string): string =>
      `arn:aws:${service}:${REGION}:${account}:${resource}`;
    const logStreams = (key: FunctionKey): string =>
      regional('logs', `log-group:/aws/lambda/${FUNCTION_NAMES[key]}:*`);
    const parameter = (name: string): string => regional('ssm', `parameter${name}`);

    const lambdaRole = (key: FunctionKey, statements: iam.PolicyStatement[]): iam.Role =>
      new iam.Role(this, `${key}Role`, {
        roleName: ROLE_NAMES[key],
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        inlinePolicies: {
          [key]: new iam.PolicyDocument({
            statements: [
              new iam.PolicyStatement({
                actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
                resources: [logStreams(key)],
              }),
              ...statements,
            ],
          }),
        },
      });

    const models = [...new Set([PRIMARY_MODEL, ESCALATION_MODEL])];
    const profileArns = models.map((m) => regional('bedrock', `inference-profile/${m}`));
    const extractRole = lambdaRole('extract', [
      new iam.PolicyStatement({ actions: ['bedrock:InvokeModel'], resources: profileArns }),
      // A geographic profile invokes the model in whichever EU region it routes to; only via the profile.
      new iam.PolicyStatement({
        actions: ['bedrock:InvokeModel'],
        resources: models.flatMap((m) =>
          EU_PROFILE_DESTINATIONS.map(
            (r) => `arn:aws:bedrock:${r}::foundation-model/${foundationModelId(m)}`,
          ),
        ),
        conditions: { StringEquals: { 'bedrock:InferenceProfileArn': profileArns } },
      }),
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          parameter(PARAMETER_NAMES.tokenKey),
          parameter(PARAMETER_NAMES.turnstileSecretKey),
        ],
      }),
    ]);
    const checkoutRole = lambdaRole('checkout', [
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [parameter(PARAMETER_NAMES.stripeSecretKey)],
      }),
    ]);
    const passRole = lambdaRole('pass', [
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          parameter(PARAMETER_NAMES.stripeSecretKey),
          parameter(PARAMETER_NAMES.tokenKey),
        ],
      }),
    ]);

    // Budget: the whole account, because Claude on Bedrock is billed through AWS Marketplace and
    // a service filter on Bedrock would not see it. Budgets are in USD.
    const denyBedrock = new iam.ManagedPolicy(this, 'DenyBedrock', {
      managedPolicyName: DENY_BEDROCK_POLICY_NAME,
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          actions: ['bedrock:InvokeModel', 'bedrock:InvokeModelWithResponseStream'],
          resources: ['*'],
        }),
      ],
    });
    const budgetActionRole = new iam.Role(this, 'BudgetActionRole', {
      roleName: 'eslojusto-api-budget-action',
      assumedBy: new iam.ServicePrincipal('budgets.amazonaws.com'),
      inlinePolicies: {
        attachDeny: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['iam:AttachRolePolicy', 'iam:DetachRolePolicy'],
              resources: [extractRole.roleArn],
              conditions: { ArnEquals: { 'iam:PolicyARN': denyBedrock.managedPolicyArn } },
            }),
          ],
        }),
      },
    });
    const email = { subscriptionType: 'EMAIL', address: props.alertEmail };
    const budget = new budgets.CfnBudget(this, 'Budget', {
      budget: {
        budgetName: BUDGET_NAME,
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: MONTHLY_BUDGET_USD, unit: 'USD' },
      },
      notificationsWithSubscribers: BUDGET_ALERT_PERCENTAGES.map((threshold) => ({
        notification: {
          notificationType: 'ACTUAL',
          comparisonOperator: 'GREATER_THAN',
          threshold,
          thresholdType: 'PERCENTAGE',
        },
        subscribers: [email],
      })),
    });
    const action = new budgets.CfnBudgetsAction(this, 'DenyBedrockAt100', {
      budgetName: BUDGET_NAME,
      actionType: 'APPLY_IAM_POLICY',
      actionThreshold: { type: 'PERCENTAGE', value: 100 },
      notificationType: 'ACTUAL',
      approvalModel: 'AUTOMATIC',
      executionRoleArn: budgetActionRole.roleArn,
      definition: {
        iamActionDefinition: {
          policyArn: denyBedrock.managedPolicyArn,
          roles: [ROLE_NAMES.extract],
        },
      },
      subscribers: [{ type: 'EMAIL', address: props.alertEmail }],
    });
    action.node.addDependency(budget, extractRole, budgetActionRole);

    // GitHub Actions deploys only from the protected environment, through the CDK bootstrap roles.
    const github = new iam.CfnOIDCProvider(this, 'GitHubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIdList: ['sts.amazonaws.com'],
    });
    const deployRole = new iam.Role(this, 'GitHubDeployRole', {
      roleName: DEPLOY_ROLE_NAME,
      maxSessionDuration: Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(github.attrArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPOSITORY}:environment:${GITHUB_ENVIRONMENT}`,
        },
      }),
      inlinePolicies: {
        assumeCdkRoles: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['sts:AssumeRole'],
              resources: ['deploy', 'file-publishing'].map(
                (r) =>
                  `arn:aws:iam::${account}:role/cdk-${CDK_QUALIFIER}-${r}-role-${account}-${REGION}`,
              ),
            }),
          ],
        }),
      },
    });

    // Passed to `cdk bootstrap --cloudformation-execution-policies`: what CloudFormation may do
    // on CI's behalf is exactly what ApiStack contains.
    const functionArns = Object.values(FUNCTION_NAMES).map((n) =>
      regional('lambda', `function:${n}`),
    );
    const cfnExecution = new iam.ManagedPolicy(this, 'CfnExecutionPolicy', {
      managedPolicyName: CFN_EXECUTION_POLICY_NAME,
      statements: [
        new iam.PolicyStatement({ actions: ['lambda:*'], resources: functionArns }),
        new iam.PolicyStatement({
          actions: ['logs:*'],
          resources: Object.values(FUNCTION_NAMES).map((n) =>
            regional('logs', `log-group:/aws/lambda/${n}`),
          ),
        }),
        new iam.PolicyStatement({ actions: ['logs:DescribeLogGroups'], resources: ['*'] }),
        new iam.PolicyStatement({
          actions: ['iam:PassRole'],
          resources: [extractRole.roleArn, checkoutRole.roleArn, passRole.roleArn],
          conditions: { StringEquals: { 'iam:PassedToService': 'lambda.amazonaws.com' } },
        }),
        new iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [`arn:aws:s3:::cdk-${CDK_QUALIFIER}-assets-${account}-${REGION}/*`],
        }),
      ],
    });

    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
    new CfnOutput(this, 'CfnExecutionPolicyArn', { value: cfnExecution.managedPolicyArn });
  }
}

export interface AppConfig {
  readonly stripePriceId: string;
  // Only for the hand-run deployment of the global stack; CI deploys never see it.
  readonly alertEmail?: string;
}

export function buildApp(config: AppConfig, app = new App()) {
  const api = new ApiStack(app, 'EslojustoApi', {
    stripePriceId: config.stripePriceId,
    analyticsReporting: false,
  });
  const global =
    config.alertEmail === undefined
      ? undefined
      : new GlobalStack(app, 'EslojustoApiGlobal', {
          alertEmail: config.alertEmail,
          analyticsReporting: false,
        });
  return { app, api, global };
}
