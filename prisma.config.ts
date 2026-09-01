import { existsSync } from 'node:fs'
import { defineConfig, env } from 'prisma/config'

// Prisma 7 no longer loads .env automatically for the config file. Node's built-in
// loader avoids adding dotenv as a dependency.
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

/**
 * Prisma 7 configuration.
 *
 * The datasource URL lives here rather than in schema.prisma — Prisma 7 removed
 * `url` from the schema. Migrate and introspection read it from this file;
 * PrismaClient gets a driver adapter at construction instead.
 */
export default defineConfig({
  // Folder, not a file: Prisma merges every .prisma file inside it.
  schema: './prisma/schema',

  datasource: {
    url: env('DATABASE_URL'),
    // Only set when a dedicated shadow database is needed (managed Postgres that
    // forbids CREATE DATABASE). env() throws on an unset variable, so it is
    // included conditionally rather than always.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: env('SHADOW_DATABASE_URL') }
      : {}),
  },

  migrations: {
    path: './prisma/migrations',
    seed: 'npx tsx prisma/seed/index.ts',
  },
})
