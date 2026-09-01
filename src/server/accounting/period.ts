import 'server-only'

import { AccountingError } from './errors'
import type { PrismaTransaction } from '@/server/db/client'

/**
 * Period resolution and lock enforcement — docs/08-period-close.md.
 *
 * Every posting resolves its accounting period from the entry date and is
 * rejected if that period is closed. This is what stops someone quietly
 * restating a month whose numbers have already been reported.
 */

export type ResolvedPeriod = {
  periodId: string
  fiscalYearId: string
  fiscalYearCode: string
}

/**
 * Find the open period containing `entryDate`.
 *
 * SOFT_CLOSED periods accept postings only from ACCOUNTANT/ADMIN; CLOSED periods
 * accept none. A reversal of a closed-period voucher must be dated into an open
 * period rather than forced back into the original one.
 */
export async function resolvePeriod(
  tx: PrismaTransaction,
  entryDate: Date,
  options: { canPostToSoftClosed?: boolean } = {},
): Promise<ResolvedPeriod> {
  const { canPostToSoftClosed = false } = options

  const period = await tx.accountingPeriod.findFirst({
    where: {
      startDate: { lte: entryDate },
      endDate: { gte: entryDate },
    },
    include: { fiscalYear: true },
  })

  if (!period) {
    throw new AccountingError(
      'NO_OPEN_PERIOD',
      `No accounting period covers ${entryDate.toISOString().slice(0, 10)}. Create the fiscal year first.`,
      { entryDate },
    )
  }

  if (period.fiscalYear.status === 'CLOSED') {
    throw new AccountingError(
      'FISCAL_YEAR_CLOSED',
      `Fiscal year ${period.fiscalYear.name} is closed. Post the correction into an open year.`,
      { fiscalYear: period.fiscalYear.name },
    )
  }

  if (period.status === 'CLOSED') {
    throw new AccountingError(
      'PERIOD_CLOSED',
      `Period ${period.name} is closed. Post the correction into an open period.`,
      { period: period.name },
    )
  }

  if (period.status === 'SOFT_CLOSED' && !canPostToSoftClosed) {
    throw new AccountingError(
      'PERIOD_SOFT_CLOSED',
      `Period ${period.name} is soft-closed. Only an accountant or admin may post to it.`,
      { period: period.name },
    )
  }

  return {
    periodId: period.id,
    fiscalYearId: period.fiscalYearId,
    fiscalYearCode: period.fiscalYear.code,
  }
}

/**
 * Reject an entry dated further back than policy allows.
 * `fiscalYear.allowBackdatedDays` — 0 means today only. ADMIN bypasses.
 */
export function assertBackdatingAllowed(
  entryDate: Date,
  today: Date,
  allowedDays: number,
  isAdmin: boolean,
): void {
  if (isAdmin) return

  const days = Math.floor((today.getTime() - entryDate.getTime()) / 86_400_000)
  if (days > allowedDays) {
    throw new AccountingError(
      'BACKDATING_NOT_ALLOWED',
      `Entry is ${days} days old; policy allows ${allowedDays}. An admin can override.`,
      { days, allowedDays },
    )
  }
}
