import 'server-only'

import { ACCOUNTS } from '@/server/accounting/accounts'
import * as ledger from '@/server/db/repositories/ledger'

/**
 * Accounting dashboard.
 *
 * Everything financial is read from JournalLine, never recomputed from source
 * tables — docs/modules/11-reports.md rule 1. Returns plain strings so nothing
 * Decimal-shaped crosses into a Client Component.
 */

export type DashboardData = {
  fiscalYear: { name: string; code: string; start: string; end: string } | null
  currentPeriod: { name: string; status: string } | null
  counts: { accounts: number; posted: number; reversed: number }
  trialBalance: { debit: string; credit: string; difference: string; balanced: boolean }
  byType: { type: string; debit: string; credit: string; net: string }[]
  suspenseBalance: string
  recent: {
    id: string
    voucherNo: string
    date: string
    narration: string
    status: string
    amount: string
  }[]
  warnings: string[]
}

const TYPE_ORDER = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE']

export async function getDashboardData(today: Date): Promise<DashboardData> {
  const [
    fiscalYear,
    period,
    accounts,
    posted,
    reversed,
    totals,
    byType,
    suspense,
    recent,
  ] = await Promise.all([
    ledger.findCurrentFiscalYear(),
    ledger.findPeriodFor(today),
    ledger.countPostableAccounts(),
    ledger.countPostedVouchers(),
    ledger.countReversedVouchers(),
    ledger.sumAllPostings(),
    ledger.balancesByAccountType(),
    ledger.balanceOfAccount(ACCOUNTS.SUSPENSE),
    ledger.findRecentVouchers(8),
  ])

  // Prefer the year owning today's period; fall back to the newest open year
  // when today falls outside every period (before go-live, or after the last
  // year ends).
  const currentYear = period?.fiscalYear ?? fiscalYear

  const difference = (Number(totals.debit) - Number(totals.credit)).toFixed(2)
  const balanced = Number(difference) === 0

  const warnings: string[] = []
  if (!balanced) {
    warnings.push(
      `Trial balance is out by ${difference}. This should be impossible — investigate immediately.`,
    )
  }
  if (Number(suspense) !== 0) {
    warnings.push(
      `Suspense account (${ACCOUNTS.SUSPENSE}) holds ${suspense}. Allocate it before closing the period.`,
    )
  }
  if (!fiscalYear) {
    warnings.push('No open fiscal year. Nothing can be posted until one exists.')
  }

  return {
    // The year that actually contains today's period, not merely the newest
    // open one — otherwise the header pairs an unrelated year with the current
    // month (e.g. "FY2027-28 · Aug 2026") the moment a future year is created.
    fiscalYear: currentYear
      ? {
          name: currentYear.name,
          code: currentYear.code,
          start: currentYear.startDate.toISOString().slice(0, 10),
          end: currentYear.endDate.toISOString().slice(0, 10),
        }
      : null,
    currentPeriod: period ? { name: period.name, status: period.status } : null,
    counts: { accounts, posted, reversed },
    trialBalance: { ...totals, difference, balanced },
    byType: TYPE_ORDER.map((type) => {
      const row = byType.find((r) => r.type === type)
      const debit = Number(row?.debit ?? 0)
      const credit = Number(row?.credit ?? 0)
      // Assets and expenses are debit-normal; the rest are credit-normal.
      const net = ['ASSET', 'EXPENSE'].includes(type) ? debit - credit : credit - debit
      return {
        type,
        debit: debit.toFixed(2),
        credit: credit.toFixed(2),
        net: net.toFixed(2),
      }
    }),
    suspenseBalance: Number(suspense).toFixed(2),
    recent: recent.map((entry) => ({
      id: entry.id,
      voucherNo: entry.voucherNo,
      date: entry.entryDate.toISOString().slice(0, 10),
      narration: entry.narration,
      status: entry.status,
      amount: entry.lines
        .reduce((sum, line) => sum + Number(line.debit ?? 0), 0)
        .toFixed(2),
    })),
    warnings,
  }
}
