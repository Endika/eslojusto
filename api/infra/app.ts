import { App } from 'aws-cdk-lib';
import { buildApp } from './stacks';

const app = new App();
const stripePriceId: unknown = app.node.tryGetContext('stripePriceId');
const alertEmail: unknown = app.node.tryGetContext('alertEmail');
if (typeof stripePriceId !== 'string' || stripePriceId === '')
  throw new Error('Missing context: -c stripePriceId=price_...');

buildApp(
  {
    stripePriceId,
    ...(typeof alertEmail === 'string' && alertEmail !== '' && { alertEmail }),
  },
  app,
);
