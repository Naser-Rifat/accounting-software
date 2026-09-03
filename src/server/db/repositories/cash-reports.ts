import 'server-only'

import { prisma } from '@/server/db/client'

/**
 * Cash and bank reporting queries — the Cash & Bank Book and the Receipts &
 * Payments account.
 *
 * "Fund accounts" means Cash in Hand and Bank Accounts *and everything beneath
 * them*: BankAccount.glAccountCode points at a sub-account under 1020, so a
 * flat `code IN ('1010','1020')` would silently miss every real bank account.
 * The recursive CTE walks the account tree instead.
 *
 * As everywhere else, only POSTED and REVERSED vouchers count. A reversal is
 * itself a posting; excluding it would leave the original standing.
 */

export type FundAccount = {
  code: string
  name: string
  /** 'CASH' for the 1010 subtree, 'BANK' for the 1020 subtree. */
  book: string
}

/**
 * Every postable account in the cash and bank subtrees, tagged with which book
 * it belongs to.
 */
export async function fundAccounts(cashRoot: string, bankRoot: string) {
  return prisma.$queryRaw<FundAccount[]>`
    WITH RECURSIVE tree AS (
      SELECT a."id", a."code", a."name", a."isGroup", a."isActive",
             CASE WHEN a."code" = ${cashRoot} THEN 'CASH' ELSE 'BANK' END AS book
        FROM "Account" a
       WHERE a."code" IN (${cashRoot}, ${bankRoot})
      UNION ALL
      SELECT c."id", c."code", c."name", c."isGroup", c."isActive", t.book
        FROM "Account" c
        JOIN tree t ON c."parentId" = t."id"
    )
    SELECT "code", "name", book
      FROM tree
     WHERE NOT "isGroup" AND "isActive"
     ORDER BY book, "code"
  `
}

export type FundLedgerRow = {
  accountCode: string
  entryId: string
  voucherNo: string
  voucherType: string
  entryDate: Date
  narration: string
  lineNarration: string | null
  status: string
  debit: string
  credit: string
}

/** Every movement on the given fund accounts in a period, in posting order. */
export async function fundLedger(codes: string[], from: Date, to: Date) {
  if (codes.length === 0) return []
  return prisma.$queryRaw<FundLedgerRow[]>`
    SELECT a."code"                AS "accountCode",
           e."id"                  AS "entryId",
           e."voucherNo"           AS "voucherNo",
           e."voucherType"::text   AS "voucherType",
           e."entryDate"           AS "entryDate",
           e."narration",
           l."lineNarration"       AS "lineNarration",
           e."status"::text        AS status,
           l."debit"::text         AS debit,
           l."credit"::text        AS credit
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."code" = ANY(${codes})
       AND e."entryDate" BETWEEN ${from} AND ${to}
     ORDER BY a."code", e."entryDate", e."voucherNo", l."seq"
  `
}

export type FundOpeningRow = { accountCode: string; balance: string }

/**
 * Balance brought forward per fund account, as at the day before the period.
 * Returned per account rather than as one total, because a cash book opens each
 * account with its own balance forward.
 */
export async function fundOpeningBalances(codes: string[], before: Date) {
  if (codes.length === 0) return []
  return prisma.$queryRaw<FundOpeningRow[]>`
    SELECT a."code" AS "accountCode",
           (COALESCE(SUM(l."debit"), 0) - COALESCE(SUM(l."credit"), 0))::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND a."code" = ANY(${codes})
       AND e."entryDate" < ${before}
     GROUP BY a."code"
  `
}
