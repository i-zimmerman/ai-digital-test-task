import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { join } from 'node:path';
import { repoRoot } from './src/lib/paths';

// Same root-relative .env as the app — see the note in src/config.ts.
loadEnv({ path: join(repoRoot(), '.env'), quiet: true });

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      'postgres://postgres:postgres@localhost:5433/review_signal',
  },
});
