import { App } from 'aws-cdk-lib';
import { buildApp } from './stacks';

const app = new App();
const stripePriceId: unknown = app.node.tryGetContext('stripePriceId');
const alertEmail: unknown = app.node.tryGetContext('alertEmail');
const reserveConcurrency: unknown = app.node.tryGetContext('reserveConcurrency');
if (typeof stripePriceId !== 'string' || stripePriceId === '')
  throw new Error('Missing context: -c stripePriceId=price_...');

buildApp(
  {
    stripePriceId,
    ...(reserveConcurrency === 'false' && { reserveConcurrency: false }),
    ...(typeof alertEmail === 'string' && alertEmail !== '' && { alertEmail }),
  },
  app,
);
