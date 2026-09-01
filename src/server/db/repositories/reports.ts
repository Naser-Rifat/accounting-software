import 'server-only'

import { prisma } from '@/server/db/client'

/**
 * Financial report queries.
 *
 * Every figure comes from JournalLine — never recomputed from source tables, or
 * the reports and the ledger drift apart (docs/modules/11-reports.md rule 1).
 * Aggregation happens in SQL; rows are never summed in JavaScript.
 */

export type TrialBalanceRow = {
  code: string
  name: string
  type: string
  isContra: boolean
  debit: string
  credit: string
}

export async function trialBalance(asOf: Date, from?: Date) {
  return prisma.$queryRaw<TrialBalanceRow[]>`
    SELECT a."code",
           a."name",
           a."type"::text                    AS type,
           a."isContra"                      AS "isContra",
           COALESCE(SUM(l."debit"), 0)::text  AS debit,
           COALESCE(SUM(l."credit"), 0)::text AS credit
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
       AND e."entryDate" <= ${asOf}
       AND (${from ?? null}::date IS NULL OR e."entryDate" >= ${from ?? null}::date)
     GROUP BY a."code", a."name", a."type", a."isContra"
     HAVING COALESCE(SUM(l."debit"), 0) <> 0 OR COALESCE(SUM(l."credit"), 0) <> 0
     ORDER BY a."code"
  `
}

export type LedgerRow = {
  entryId: string
  voucherNo: string
  voucherType: string
  entryDate: Date
  narration: string
  lineNarration: string | null
  partyName: string | null
  debit: string
  credit: string
}

/** Opening balance for an account: everything posted strictly before `from`. */
export async function openingBalance(accountCode: string, from: Date) {
  const rows = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${accountCode}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND e."entryDate" < ${from}
  `
  return rows[0]?.balance ?? '0'
}

export async function generalLedger(accountCode: string, from: Date, to: Date) {
  return prisma.$queryRaw<LedgerRow[]>`
    SELECT e."id"          AS "entryId",
           e."voucherNo"   AS "voucherNo",
           e."voucherType"::text AS "voucherType",
           e."entryDate"   AS "entryDate",
           e."narration",
           l."lineNarration" AS "lineNarration",
           p."name"        AS "partyName",
           l."debit"::text  AS debit,
           l."credit"::text AS credit
      FROM "JournalLine" l
      JOIN "Account" a       ON a."id" = l."accountId"
      JOIN "JournalEntry" e  ON e."id" = l."entryId"
      LEFT JOIN "Party" p    ON p."id" = l."partyId"
     WHERE a."code" = ${accountCode}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND e."entryDate" BETWEEN ${from} AND ${to}
     ORDER BY e."entryDate", e."voucherNo", l."seq"
  `
}

export async function partyOpeningBalance(partyId: string, from: Date) {
  const rows = await prisma.$queryRaw<{ balance: string }[]>`
    SELECT COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS balance
      FROM "JournalLine" l
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE l."partyId" = ${partyId}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND e."entryDate" < ${from}
  `
  return rows[0]?.balance ?? '0'
}

export async function partyLedger(partyId: string, from: Date, to: Date) {
  return prisma.$queryRaw<LedgerRow[]>`
    SELECT e."id"          AS "entryId",
           e."voucherNo"   AS "voucherNo",
           e."voucherType"::text AS "voucherType",
           e."entryDate"   AS "entryDate",
           e."narration",
           l."lineNarration" AS "lineNarration",
           a."name"        AS "partyName",
           l."debit"::text  AS debit,
           l."credit"::text AS credit
      FROM "JournalLine" l
      JOIN "JournalEntry" e ON e."id" = l."entryId"
      JOIN "Account" a      ON a."id" = l."accountId"
     WHERE l."partyId" = ${partyId}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND e."entryDate" BETWEEN ${from} AND ${to}
     ORDER BY e."entryDate", e."voucherNo", l."seq"
  `
}

/**
 * Control-account reconciliation: the GL control balance against the sum of its
 * party subledger. A non-zero difference is a defect, not a rounding artefact.
 */
export async function controlAccountReconciliation() {
  return prisma.$queryRaw<
    { code: string; name: string; controlBalance: string; partyBalance: string }[]
  >`
    SELECT a."code",
           a."name",
           COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS "controlBalance",
           COALESCE(SUM(CASE WHEN l."partyId" IS NOT NULL
                             THEN l."debit" - l."credit" ELSE 0 END), 0)::text AS "partyBalance"
      FROM "Account" a
      LEFT JOIN "JournalLine" l  ON l."accountId" = a."id"
      LEFT JOIN "JournalEntry" e ON e."id" = l."entryId" AND e."status" IN ('POSTED', 'REVERSED')
     WHERE a."isControl" = true
     GROUP BY a."code", a."name"
     ORDER BY a."code"
  `
}
