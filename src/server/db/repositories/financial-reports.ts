import 'server-only'

import { prisma } from '@/server/db/client'

/**
 * Statutory and tax report queries.
 *
 * Every figure comes from JournalLine — never recomputed from source tables, or
 * the reports and the ledger drift apart (docs/modules/11-reports.md rule 1).
 * Aggregation happens in SQL; rows are never summed in JavaScript.
 *
 * REVERSED vouchers are included: a reversal is itself a posting, and its
 * mirror-image lines are what cancel the original. Excluding them would leave
 * the original standing and overstate every figure.
 */

export type AccountMovementRow = {
  code: string
  name: string
  type: string
  isContra: boolean
  debit: string
  credit: string
}

/**
 * Income and expense movement over a period — the basis of the P&L.
 * A movement between two dates, never a balance as at one: profit is what
 * happened during the period.
 */
export async function incomeAndExpense(from: Date, to: Date) {
  return prisma.$queryRaw<AccountMovementRow[]>`
    SELECT a."code",
           a."name",
           a."type"::text                     AS type,
           a."isContra"                       AS "isContra",
           COALESCE(SUM(l."debit"), 0)::text  AS debit,
           COALESCE(SUM(l."credit"), 0)::text AS credit
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."type" IN ('INCOME', 'EXPENSE')
       AND e."entryDate" BETWEEN ${from} AND ${to}
     GROUP BY a."code", a."name", a."type", a."isContra"
     HAVING COALESCE(SUM(l."debit"), 0) <> 0 OR COALESCE(SUM(l."credit"), 0) <> 0
     ORDER BY a."code"
  `
}

/** Cumulative balances of the balance-sheet accounts as at a date. */
export async function balanceSheetAccounts(asOf: Date) {
  return prisma.$queryRaw<AccountMovementRow[]>`
    SELECT a."code",
           a."name",
           a."type"::text                     AS type,
           a."isContra"                       AS "isContra",
           COALESCE(SUM(l."debit"), 0)::text  AS debit,
           COALESCE(SUM(l."credit"), 0)::text AS credit
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."type" IN ('ASSET', 'LIABILITY', 'EQUITY')
       AND e."entryDate" <= ${asOf}
     GROUP BY a."code", a."name", a."type", a."isContra"
     HAVING COALESCE(SUM(l."debit"), 0) <> 0 OR COALESCE(SUM(l."credit"), 0) <> 0
     ORDER BY a."code"
  `
}

/**
 * Net profit for a period.
 *
 * Credit less debit across every income and expense account. Income is
 * credit-normal so it comes out positive; expense is debit-normal so it comes
 * out negative and reduces the result — which is exactly what profit means.
 * This is the figure the balance sheet must tie to.
 */
export async function netProfit(from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ net: string }[]>`
    SELECT COALESCE(SUM(l."credit" - l."debit"), 0)::text AS net
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."type" IN ('INCOME', 'EXPENSE')
       AND e."entryDate" BETWEEN ${from} AND ${to}
  `
  return rows[0]?.net ?? '0'
}

/** Profit earned before the period started — the opening retained result. */
export async function netProfitBefore(from: Date) {
  const rows = await prisma.$queryRaw<{ net: string }[]>`
    SELECT COALESCE(SUM(l."credit" - l."debit"), 0)::text AS net
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."type" IN ('INCOME', 'EXPENSE')
       AND e."entryDate" < ${from}
  `
  return rows[0]?.net ?? '0'
}

export type CashMovementRow = {
  code: string
  name: string
  contraType: string
  contraCode: string
  contraName: string
  debit: string
  credit: string
}

/**
 * Cash movement, classified by what it was posted against.
 *
 * Read from the **contra** lines, not the cash lines. Joining each cash line to
 * its contra lines would fan out: a voucher with one bank line and three other
 * lines would count the bank amount three times. Because every voucher balances,
 * summing the non-cash side of a cash voucher gives exactly the cash effect —
 * a credit on the other side means cash came in, a debit means cash went out.
 *
 * Transfers between two cash accounts have no non-cash line and so drop out
 * naturally: they move money without being a cash flow.
 */
export async function cashMovements(from: Date, to: Date, cashCodes: string[]) {
  return prisma.$queryRaw<CashMovementRow[]>`
    SELECT other_acct."code",
           other_acct."name",
           other_acct."type"::text                     AS "contraType",
           other_acct."code"                           AS "contraCode",
           other_acct."name"                           AS "contraName",
           COALESCE(SUM(other_line."debit"), 0)::text  AS debit,
           COALESCE(SUM(other_line."credit"), 0)::text AS credit
      FROM "JournalEntry" e
      JOIN "JournalLine" other_line ON other_line."entryId" = e."id"
      JOIN "Account" other_acct     ON other_acct."id" = other_line."accountId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND other_acct."code" <> ALL(${cashCodes})
       AND e."entryDate" BETWEEN ${from} AND ${to}
       AND EXISTS (
             SELECT 1
               FROM "JournalLine" cash_line
               JOIN "Account" cash_acct ON cash_acct."id" = cash_line."accountId"
              WHERE cash_line."entryId" = e."id"
                AND cash_acct."code" = ANY(${cashCodes})
           )
     GROUP BY other_acct."type", other_acct."code", other_acct."name"
     ORDER BY other_acct."code"
  `
}

/** Cash and bank balance as at a date, for the cash flow's opening and closing. */
export async function cashBalanceAsOf(asOf: Date, cashCodes: string[]) {
  const rows = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."code" = ANY(${cashCodes})
       AND e."entryDate" <= ${asOf}
  `
  return rows[0]?.balance ?? '0'
}

export type DayBookRow = {
  entryId: string
  voucherType: string
  voucherNo: string
  entryDate: Date
  narration: string
  status: string
  createdBy: string
  amount: string
}

/** Every voucher in a range, in posting order. */
export async function dayBook(from: Date, to: Date) {
  return prisma.$queryRaw<DayBookRow[]>`
    SELECT e."id"                            AS "entryId",
           e."voucherType"::text             AS "voucherType",
           e."voucherNo"                     AS "voucherNo",
           e."entryDate"                     AS "entryDate",
           e."narration",
           e."status"::text                  AS status,
           e."createdBy"                     AS "createdBy",
           COALESCE(SUM(l."debit"), 0)::text AS amount
      FROM "JournalEntry" e
      JOIN "JournalLine" l ON l."entryId" = e."id"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND e."entryDate" BETWEEN ${from} AND ${to}
     GROUP BY e."id", e."voucherType", e."voucherNo", e."entryDate",
              e."narration", e."status", e."createdBy"
     ORDER BY e."entryDate", e."voucherNo"
  `
}

export type TaxLineRow = {
  entryDate: Date
  voucherNo: string
  narration: string
  partyName: string | null
  debit: string
  credit: string
}

/** Every movement on one tax account, with the party it relates to. */
export async function taxAccountMovements(accountCode: string, from: Date, to: Date) {
  return prisma.$queryRaw<TaxLineRow[]>`
    SELECT e."entryDate"    AS "entryDate",
           e."voucherNo"    AS "voucherNo",
           e."narration",
           p."name"         AS "partyName",
           l."debit"::text  AS debit,
           l."credit"::text AS credit
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
      LEFT JOIN "Party" p   ON p."id" = l."partyId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."code" = ${accountCode}
       AND e."entryDate" BETWEEN ${from} AND ${to}
     ORDER BY e."entryDate", e."voucherNo"
  `
}

/** Net movement on a single account over a period. */
export async function accountMovement(accountCode: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<{ debit: string; credit: string }[]>`
    SELECT COALESCE(SUM(l."debit"), 0)::text  AS debit,
           COALESCE(SUM(l."credit"), 0)::text AS credit
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."code" = ${accountCode}
       AND e."entryDate" BETWEEN ${from} AND ${to}
  `
  return rows[0] ?? { debit: '0', credit: '0' }
}
