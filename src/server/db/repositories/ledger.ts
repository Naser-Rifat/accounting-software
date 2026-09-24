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

/**
 * Subledger balances straight from the ledger, one per party.
 *
 * A party's outstanding is never stored on the party — it is the sum of its
 * lines on the control account, so it cannot drift from the books. `side`
 * says which way is "owed": a receivable (1110, 1120) is debit − credit, a
 * payable (2010, 2020) is credit − debit. Only POSTED and REVERSED entries
 * count; a PENDING_APPROVAL voucher is invisible to every balance.
 */
export async function controlBalances(
  accountCode: string,
  partyIds: string[],
  side: 'DEBIT' | 'CREDIT',
): Promise<Map<string, string>> {
  if (partyIds.length === 0) return new Map()

  const rows = await prisma.$queryRaw<{ partyId: string; balance: string }[]>`
    SELECT l."partyId",
           (CASE WHEN ${side} = 'DEBIT'
                 THEN SUM(l."debit") - SUM(l."credit")
                 ELSE SUM(l."credit") - SUM(l."debit") END)::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${accountCode}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND l."partyId" = ANY(${partyIds}::text[])
     GROUP BY l."partyId"
  `
  return new Map(rows.map((r) => [r.partyId, Number(r.balance).toFixed(2)]))
}
