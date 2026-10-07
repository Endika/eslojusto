import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { REGION } from '../config';

const client = new SSMClient({ region: REGION });

export async function loadParameters<K extends string>(
  names: Readonly<Record<K, string>>,
): Promise<Record<K, string>> {
  const entries = await Promise.all(
    (Object.entries(names) as [K, string][]).map(async ([key, name]) => {
      const { Parameter } = await client.send(
        new GetParameterCommand({ Name: name, WithDecryption: true }),
      );
      if (!Parameter?.Value) throw new Error('Missing parameter');
      return [key, Parameter.Value] as const;
    }),
  );
  return Object.fromEntries(entries) as Record<K, string>;
}
