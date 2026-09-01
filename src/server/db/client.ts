import 'server-only'

import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '@/generated/prisma/client'

/**
 * The single PrismaClient for the whole app.
 *
 * Prisma 7 takes a driver adapter rather than a connection URL in the schema, so
 * the pool is configured here. Cached on globalThis because Next.js dev reloads
 * modules on every change, and a new client per reload exhausts the connection
 * pool within minutes.
 *
 * Nothing outside `src/server/db/repositories/` and `src/server/accounting/`
 * should import this — see docs/12-project-structure.md.
 */

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Copy .env.example to .env and point it at your Postgres instance.',
  )
}

function createPrismaClient() {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

/** The transaction client type, for functions that must run inside `$transaction`. */
export type PrismaTransaction = Parameters<
  Parameters<typeof prisma.$transaction>[0]
>[0]
