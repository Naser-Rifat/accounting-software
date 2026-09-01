import 'server-only'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { postEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'
import { balanceOfAccount, sumAllPostings } from '@/server/db/repositories/ledger'
import { getControlReconciliation } from '@/server/services/reports-service'
import type { PeriodStatus } from '@/generated/prisma/enums'

/** Accounting periods, the month-end checklist, and year-end close. */

export async function listFiscalYears() {
  return prisma.fiscalYear.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      periods: {
        orderBy: { seq: 'asc' },
        include: { _count: { select: { entries: true } } },
      },
    },
  })
}

export type ChecklistItem = {
  label: string
  passed: boolean
  detail: string
}

/**
 * Month-end checklist — docs/08-period-close.md.
 * Only the checks the accounting module can answer today; the rest arrive with
 * the modules that own them (bank reconciliation, accruals, depreciation).
 */
export async function getPeriodChecklist(periodId: string): Promise<ChecklistItem[]> {
  const [drafts, suspense, control, totals] = await Promise.all([
    prisma.journalEntry.count({ where: { periodId, status: 'DRAFT' } }),
    balanceOfAccount(ACCOUNTS.SUSPENSE),
    getControlReconciliation(),
    sumAllPostings(),
  ])

  const unreconciled = control.filter((row) => !row.reconciled)
  const difference = Number(totals.debit) - Number(totals.credit)

  return [
    {
      label: 'All draft vouchers posted or deleted',
      passed: drafts === 0,
      detail: drafts === 0 ? 'No drafts' : `${drafts} draft voucher(s) remain`,
    },
    {
      label: 'Suspense account (9000) is clear',
      passed: Number(suspense) === 0,
      detail: Number(suspense) === 0 ? 'Zero balance' : `Holds ${suspense}`,
    },
    {
      label: 'Control accounts match their subsidiary ledgers',
      passed: unreconciled.length === 0,
      detail:
        unreconciled.length === 0
          ? 'All reconciled'
          : `${unreconciled.length} account(s) out: ${unreconciled.map((r) => r.code).join(', ')}`,
    },
    {
      label: 'Trial balance foots',
      passed: Math.abs(difference) < 0.005,
      detail:
        Math.abs(difference) < 0.005
          ? `Dr = Cr = ${totals.debit}`
          : `Out by ${difference.toFixed(2)}`,
    },
  ]
}

export async function setPeriodStatus(
  periodId: string,
  status: PeriodStatus,
  userName: string,
) {
  const period = await prisma.accountingPeriod.findUnique({
    where: { id: periodId },
    include: { fiscalYear: true },
  })
  if (!period) throw new AccountingError('NO_OPEN_PERIOD', 'Period not found.')

  if (period.fiscalYear.status === 'CLOSED') {
    throw new AccountingError(
      'FISCAL_YEAR_CLOSED',
      `${period.fiscalYear.name} is closed; its periods cannot be changed.`,
    )
  }

  // Closing out of order would leave an open period behind a closed one, and
  // any later correction would have nowhere legal to land.
  if (status === 'CLOSED') {
    const earlierOpen = await prisma.accountingPeriod.findFirst({
      where: {
        fiscalYearId: period.fiscalYearId,
        seq: { lt: period.seq },
        status: { not: 'CLOSED' },
      },
      orderBy: { seq: 'asc' },
    })
    if (earlierOpen) {
      throw new AccountingError(
        'PERIOD_CLOSED',
        `Close ${earlierOpen.name} first — periods close in order.`,
      )
    }
  }

  return prisma.accountingPeriod.update({
    where: { id: periodId },
    data: {
      status,
      closedAt: status === 'CLOSED' ? new Date() : null,
      closedBy: status === 'CLOSED' ? userName : null,
    },
  })
}

/**
 * Year-end close — docs/08-period-close.md.
 *
 * Posts real CL vouchers rather than computing the result off-ledger: income and
 * expense accounts are zeroed into 3900, then 3900 moves to 3200. Balance sheet
 * accounts carry forward untouched.
 */
export async function closeFiscalYear(fiscalYearId: string, userName: string) {
  return prisma.$transaction(async (tx) => {
    const year = await tx.fiscalYear.findUnique({
      where: { id: fiscalYearId },
      include: { periods: true },
    })
    if (!year) throw new AccountingError('FISCAL_YEAR_CLOSED', 'Fiscal year not found.')
    if (year.status === 'CLOSED') {
      throw new AccountingError('FISCAL_YEAR_CLOSED', `${year.name} is already closed.`)
    }

    const balances = await tx.$queryRaw<
      { code: string; type: string; net: string }[]
    >`
      SELECT a."code", a."type"::text AS type,
             COALESCE(SUM(l."debit") - SUM(l."credit"), 0)::text AS net
        FROM "JournalLine" l
        JOIN "Account" a      ON a."id" = l."accountId"
        JOIN "JournalEntry" e ON e."id" = l."entryId"
       WHERE e."status" IN ('POSTED', 'REVERSED')
         AND e."entryDate" BETWEEN ${year.startDate} AND ${year.endDate}
         AND a."type" IN ('INCOME', 'EXPENSE')
       GROUP BY a."code", a."type"
      HAVING COALESCE(SUM(l."debit") - SUM(l."credit"), 0) <> 0
    `

    if (balances.length === 0) {
      throw new AccountingError(
        'EMPTY_ENTRY',
        'Nothing to close — no income or expense was posted in this year.',
      )
    }

    // Zero each P&L account against Current Year Earnings.
    const lines = balances.map((row) => {
      const net = Number(row.net)
      return net > 0
        ? { accountCode: row.code, credit: net.toFixed(2) }
        : { accountCode: row.code, debit: Math.abs(net).toFixed(2) }
    })

    const netResult = balances.reduce((sum, row) => sum + Number(row.net), 0)
    // A debit-positive total means expenses exceeded income: a loss.
    lines.push(
      netResult > 0
        ? { accountCode: ACCOUNTS.CURRENT_YEAR_EARNINGS, debit: netResult.toFixed(2) }
        : { accountCode: ACCOUNTS.CURRENT_YEAR_EARNINGS, credit: Math.abs(netResult).toFixed(2) },
    )

    const closing = await postEntry(tx, {
      voucherType: 'CL',
      entryDate: year.endDate,
      narration: `Year-end close ${year.name}: income and expense to current year earnings`,
      sourceType: 'PERIOD_CLOSE',
      sourceId: year.id,
      currency: 'BDT',
      fxRate: 1,
      createdBy: userName,
      canPostToSoftClosed: true,
      lines,
    })

    // Move the result to retained earnings.
    const transfer = await postEntry(tx, {
      voucherType: 'CL',
      entryDate: year.endDate,
      narration: `Year-end close ${year.name}: current year earnings to retained earnings`,
      sourceType: 'PERIOD_CLOSE',
      sourceId: year.id,
      currency: 'BDT',
      fxRate: 1,
      createdBy: userName,
      canPostToSoftClosed: true,
      lines:
        netResult > 0
          ? [
              { accountCode: ACCOUNTS.RETAINED_EARNINGS, debit: netResult.toFixed(2) },
              { accountCode: ACCOUNTS.CURRENT_YEAR_EARNINGS, credit: netResult.toFixed(2) },
            ]
          : [
              {
                accountCode: ACCOUNTS.CURRENT_YEAR_EARNINGS,
                debit: Math.abs(netResult).toFixed(2),
              },
              {
                accountCode: ACCOUNTS.RETAINED_EARNINGS,
                credit: Math.abs(netResult).toFixed(2),
              },
            ],
    })

    await tx.accountingPeriod.updateMany({
      where: { fiscalYearId },
      data: { status: 'CLOSED', closedAt: new Date(), closedBy: userName },
    })
    await tx.fiscalYear.update({
      where: { id: fiscalYearId },
      data: { status: 'CLOSED' },
    })

    return { closingVoucher: closing.voucherNo, transferVoucher: transfer.voucherNo }
  })
}
