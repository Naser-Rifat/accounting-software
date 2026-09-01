import 'server-only'

import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { getSetting } from '@/server/services/settings-service'

/** Fiscal years and their periods — docs/08-period-close.md. */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export async function listYears() {
  const years = await prisma.fiscalYear.findMany({
    orderBy: { startDate: 'desc' },
    include: {
      periods: {
        orderBy: { seq: 'asc' },
        include: { _count: { select: { entries: true } } },
      },
    },
  })

  return years.map((year) => ({
    id: year.id,
    name: year.name,
    code: year.code,
    startDate: year.startDate.toISOString().slice(0, 10),
    endDate: year.endDate.toISOString().slice(0, 10),
    status: year.status,
    periodCount: year.periods.length,
    voucherCount: year.periods.reduce((sum, p) => sum + p._count.entries, 0),
    openPeriods: year.periods.filter((p) => p.status === 'OPEN').length,
  }))
}

function applyPattern(pattern: string, startYear: number, endYear: number) {
  return pattern
    .replaceAll('{startYYYY}', String(startYear))
    .replaceAll('{endYYYY}', String(endYear))
    .replaceAll('{startYY}', String(startYear).slice(-2))
    .replaceAll('{endYY}', String(endYear).slice(-2))
}

/**
 * Create a fiscal year and its periods from the configured start date and
 * naming patterns. Periods are monthly or quarterly per `fiscalYear.periodLength`.
 */
export async function createFiscalYear(startYear: number) {
  const [startMonthDay, namingPattern, codePattern, periodLength, autoCreate] =
    await Promise.all([
      getSetting('fiscalYear.startMonthDay'),
      getSetting('fiscalYear.namingPattern'),
      getSetting('fiscalYear.codePattern'),
      getSetting('fiscalYear.periodLength'),
      getSetting('fiscalYear.autoCreatePeriods'),
    ])

  const [monthStr] = (startMonthDay ?? '07-01').split('-')
  const startMonth = Number(monthStr)
  const endYear = startMonth === 1 ? startYear : startYear + 1

  const name = applyPattern(namingPattern ?? 'FY{startYYYY}-{endYY}', startYear, endYear)
  const code = applyPattern(codePattern ?? '{startYY}{endYY}', startYear, endYear)

  const existing = await prisma.fiscalYear.findFirst({
    where: { OR: [{ code }, { name }] },
  })
  if (existing) {
    throw new AccountingError('INVALID_LINE', `${name} already exists.`)
  }

  const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1))
  const endDate = new Date(Date.UTC(startYear + (startMonth === 1 ? 1 : 1), startMonth - 1, 0))

  // Overlapping years would make period resolution ambiguous, and a posting could
  // land in either one.
  const overlap = await prisma.fiscalYear.findFirst({
    where: { startDate: { lte: endDate }, endDate: { gte: startDate } },
  })
  if (overlap) {
    throw new AccountingError(
      'INVALID_LINE',
      `Dates overlap ${overlap.name} (${overlap.startDate.toISOString().slice(0, 10)} to ${overlap.endDate.toISOString().slice(0, 10)}).`,
    )
  }

  const quarterly = periodLength === 'QUARTERLY'
  const periodCount = quarterly ? 4 : 12
  const monthsPerPeriod = quarterly ? 3 : 1

  return prisma.$transaction(async (tx) => {
    const year = await tx.fiscalYear.create({
      data: { name, code, startDate, endDate },
    })

    if (autoCreate !== 'false') {
      for (let i = 0; i < periodCount; i++) {
        const offset = i * monthsPerPeriod
        const monthIndex = (startMonth - 1 + offset) % 12
        const yearOffset = Math.floor((startMonth - 1 + offset) / 12)
        const periodStart = new Date(Date.UTC(startYear + yearOffset, monthIndex, 1))
        const periodEnd = new Date(
          Date.UTC(startYear + yearOffset, monthIndex + monthsPerPeriod, 0),
        )

        await tx.accountingPeriod.create({
          data: {
            fiscalYearId: year.id,
            name: quarterly
              ? `Q${i + 1} ${startYear + yearOffset}`
              : `${MONTHS[monthIndex]} ${startYear + yearOffset}`,
            seq: i + 1,
            startDate: periodStart,
            endDate: periodEnd,
          },
        })
      }
    }

    return year
  })
}
