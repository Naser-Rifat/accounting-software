import 'server-only'

import type { AccountType } from '@/generated/prisma/enums'
import { prisma } from '@/server/db/client'

/** Chart of accounts reads and writes. Queries only — no business rules. */

export async function listAccounts() {
  return prisma.account.findMany({ orderBy: { code: 'asc' } })
}

export async function listPostableAccounts() {
  return prisma.account.findMany({
    where: { isGroup: false, isActive: true },
    orderBy: { code: 'asc' },
    select: { id: true, code: true, name: true, type: true, isControl: true },
  })
}

export async function findAccountByCode(code: string) {
  return prisma.account.findUnique({ where: { code } })
}

/** Posted balance per account id, as debit and credit totals. */
export async function accountBalances() {
  return prisma.$queryRaw<
    { accountId: string; debit: string; credit: string }[]
  >`
    SELECT l."accountId"                    AS "accountId",
           COALESCE(SUM(l."debit"), 0)::text  AS debit,
           COALESCE(SUM(l."credit"), 0)::text AS credit
      FROM "JournalLine" l
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE e."status" IN ('POSTED', 'REVERSED')
     GROUP BY l."accountId"
  `
}

export async function createAccount(input: {
  code: string
  name: string
  type: AccountType
  parentId?: string | null
  isGroup: boolean
}) {
  return prisma.account.create({ data: { ...input, isSystem: false } })
}

export async function setAccountActive(id: string, isActive: boolean) {
  return prisma.account.update({ where: { id }, data: { isActive } })
}

export async function countLinesForAccount(accountId: string) {
  return prisma.journalLine.count({ where: { accountId } })
}
