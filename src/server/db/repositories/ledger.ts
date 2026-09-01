import 'server-only'

import { prisma } from '@/server/db/client'

/**
 * Ledger reads. Queries only — no business rules, no formatting.
 * Aggregation happens in SQL; rows are never pulled into JS to be summed.
 */

export async function sumAllPostings() {
  const totals = await prisma.journalLine.aggregate({
    _sum: { debit: true, credit: true },
  })
  return {
    debit: totals._sum.debit?.toFixed(2) ?? '0.00',
    credit: totals._sum.credit?.toFixed(2) ?? '0.00',
  }
}

/** Net movement per account type, for the dashboard summary. */
export async function balancesByAccountType() {
  return prisma.$queryRaw<
    { type: string; debit: string; credit: string }[]
  >`
    SELECT a."type"::text            AS type,
           COALESCE(SUM(l."debit"), 0)::text  AS debit,
           COALESCE(SUM(l."credit"), 0)::text AS credit
      FROM "JournalLine" l
      JOIN "Account" a ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
     GROUP BY a."type"
  `
}

export async function countPostableAccounts() {
  return prisma.account.count({ where: { isGroup: false, isActive: true } })
}

export async function countPostedVouchers() {
  return prisma.journalEntry.count({ where: { status: 'POSTED' } })
}

export async function countReversedVouchers() {
  return prisma.journalEntry.count({ where: { status: 'REVERSED' } })
}

export async function findCurrentFiscalYear() {
  return prisma.fiscalYear.findFirst({
    where: { status: 'OPEN' },
    orderBy: { startDate: 'desc' },
    include: { periods: { orderBy: { seq: 'asc' } } },
  })
}

export async function findPeriodFor(date: Date) {
  return prisma.accountingPeriod.findFirst({
    where: { startDate: { lte: date }, endDate: { gte: date } },
    include: { fiscalYear: true },
  })
}

export async function findRecentVouchers(limit: number) {
  return prisma.journalEntry.findMany({
    where: { status: { in: ['POSTED', 'REVERSED'] } },
    orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    include: { lines: { select: { debit: true } } },
  })
}

/** Balance of one account by code — used for the suspense-account warning. */
export async function balanceOfAccount(code: string) {
  const rows = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${code} AND e."status" IN ('POSTED', 'REVERSED')
  `
  return rows[0]?.balance ?? '0'
}
