import { Client } from 'pg';
import { config } from '../config';

const DEADLINE_MS = 60_000;

async function main(): Promise<void> {
  const started = Date.now();
  for (;;) {
    const client = new Client({ connectionString: config.databaseUrl });
    try {
      await client.connect();
      await client.query('select 1');
      await client.end();
      process.stdout.write('Postgres is ready\n');
      return;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (Date.now() - started > DEADLINE_MS) {
        process.stderr.write(
          `Postgres did not become ready within 60s: ${
            error instanceof Error ? error.message : String(error)
          }\n`,
        );
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

void main();
