import 'server-only'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { postEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'
import type { CostCenterType } from '@/generated/prisma/enums'

/** Cost centers, bank accounts, transfers and opening balances. */

// --- Cost centers ---------------------------------------------------------

export async function listCostCenters() {
  return prisma.costCenter.findMany({ orderBy: { code: 'asc' } })
}

export async function createCostCenter(input: {
  code: string
  name: string
  type: CostCenterType
}) {
  const existing = await prisma.costCenter.findUnique({ where: { code: input.code } })
  if (existing) throw new AccountingError('INVALID_LINE', `Code ${input.code} already exists.`)
  return prisma.costCenter.create({ data: input })
}

// --- Bank and cash accounts -----------------------------------------------

export async function listBankAccounts() {
  const accounts = await prisma.bankAccount.findMany({ orderBy: { name: 'asc' } })

  const balances = await prisma.$queryRaw<{ code: string; balance: string }[]>`
    SELECT a."code", COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS balance
      FROM "Account" a
      LEFT JOIN "JournalLine" l  ON l."accountId" = a."id"
      LEFT JOIN "JournalEntry" e ON e."id" = l."entryId" AND e."status" IN ('POSTED', 'REVERSED')
     WHERE a."code" IN (${ACCOUNTS.CASH_IN_HAND}, ${ACCOUNTS.BANK})
     GROUP BY a."code"
  `
  const byCode = new Map(balances.map((b) => [b.code, b.balance]))

  return accounts.map((account) => ({
    ...account,
    openingBalance: account.openingBalance.toFixed(2),
    ledgerBalance: Number(byCode.get(account.glAccountCode) ?? 0).toFixed(2),
  }))
}

export async function createBankAccount(input: {
  name: string
  bankName?: string
  accountNo?: string
  currency: string
  glAccountCode: string
  isClientAccount: boolean
}) {
  return prisma.bankAccount.create({ data: input })
}

// --- Contra transfer (CV) -------------------------------------------------

/**
 * Cash-to-bank or bank-to-bank movement. A contra voucher only ever moves money
 * between the agency's own accounts, so it never touches income or expense.
 */
export async function postTransfer(input: {
  fromAccountCode: string
  toAccountCode: string
  amount: string
  entryDate: Date
  narration: string
  createdBy: string
  canPostToSoftClosed: boolean
}) {
  if (input.fromAccountCode === input.toAccountCode) {
    throw new AccountingError('INVALID_LINE', 'Choose two different accounts.')
  }

  return prisma.$transaction((tx) =>
    postEntry(tx, {
      voucherType: 'CV',
      entryDate: input.entryDate,
      narration: input.narration,
      sourceType: 'MANUAL',
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: input.toAccountCode, debit: input.amount },
        { accountCode: input.fromAccountCode, credit: input.amount },
      ],
    }),
  )
}

// --- Opening balances (OB) ------------------------------------------------

/**
 * Go-live migration — docs/08-period-close.md.
 *
 * Each line is entered against its account; the balancing figure goes to 9100
 * Opening Balance Equity. When 9100 nets to zero against capital and retained
 * earnings, the migration is complete.
 */
export async function postOpeningBalances(input: {
  entryDate: Date
  lines: { accountCode: string; debit?: string; credit?: string }[]
  createdBy: string
  canPostToSoftClosed: boolean
}) {
  const debit = input.lines.reduce((sum, l) => sum + Number(l.debit ?? 0), 0)
  const credit = input.lines.reduce((sum, l) => sum + Number(l.credit ?? 0), 0)
  const difference = debit - credit

  const lines = [...input.lines]
  if (Math.abs(difference) >= 0.005) {
    lines.push(
      difference > 0
        ? { accountCode: ACCOUNTS.OPENING_BALANCE_EQUITY, credit: difference.toFixed(2) }
        : {
            accountCode: ACCOUNTS.OPENING_BALANCE_EQUITY,
            debit: Math.abs(difference).toFixed(2),
          },
    )
  }

  return prisma.$transaction((tx) =>
    postEntry(tx, {
      voucherType: 'OB',
      entryDate: input.entryDate,
      narration: 'Opening balances at go-live',
      sourceType: 'OPENING',
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines,
    }),
  )
}
