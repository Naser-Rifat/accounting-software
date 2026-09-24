import 'server-only'

import { AccountingError } from './errors'
import { formatNumber } from '@/lib/numbering'
import type { PrismaTransaction } from '@/server/db/client'

export { formatNumber }

/**
 * Gapless document and voucher numbering — docs/05-voucher-types.md.
 *
 * The counter is incremented with an atomic UPDATE inside the caller's
 * transaction, so two concurrent postings can never receive the same number and
 * a rolled-back posting gives its number back. Never `count(*) + 1`, which races
 * and leaves holes the moment two people post at once.
 */

export type AllocatedNumber = {
  seriesKey: string
  seq: number
  formatted: string
}

export async function allocateNumber(
  tx: PrismaTransaction,
  seriesKey: string,
  fiscalYearId: string,
  fiscalYearCode: string,
): Promise<AllocatedNumber> {
  const series = await tx.documentSeries.findUnique({ where: { key: seriesKey } })

  if (!series || !series.isActive) {
    throw new AccountingError(
      'SERIES_NOT_CONFIGURED',
      `Numbering series "${seriesKey}" is not configured. Seed it or enable it in Settings > Numbering.`,
      { seriesKey },
    )
  }

  // CONTINUOUS series share one counter across years; YEARLY restarts each year.
  const counterYearId = series.resetPolicy === 'YEARLY' ? fiscalYearId : GLOBAL_COUNTER

  const counter = await tx.documentSeriesCounter.upsert({
    where: {
      seriesKey_fiscalYearId: { seriesKey, fiscalYearId: counterYearId },
    },
    create: { seriesKey, fiscalYearId: counterYearId, nextSeq: 2 },
    update: { nextSeq: { increment: 1 } },
    select: { nextSeq: true },
  })

  // upsert returns the value AFTER incrementing, so the number we just claimed
  // is one less. On create we set nextSeq to 2 and claim 1.
  const seq = counter.nextSeq - 1

  return {
    seriesKey,
    seq,
    formatted: formatNumber({
      prefix: series.prefix,
      padding: series.padding,
      fiscalYearCode: series.resetPolicy === 'YEARLY' ? fiscalYearCode : null,
      seq,
    }),
  }
}

/**
 * CONTINUOUS series still need a row in the counter table, so they use a fixed
 * sentinel in place of a fiscal year. Kept here rather than inline so the value
 * has exactly one definition.
 */
const GLOBAL_COUNTER = '__continuous__'

/**
 * The fiscal year covering `onDate`, for numbering business documents that are
 * not postings (students, applications). Period locks do not apply to those —
 * a closed month still lets you register a student — so this deliberately does
 * not go through `resolvePeriod`.
 */
export async function fiscalYearFor(tx: PrismaTransaction, onDate: Date) {
  const fy = await tx.fiscalYear.findFirst({
    where: { startDate: { lte: onDate }, endDate: { gte: onDate } },
    select: { id: true, code: true },
  })
  if (!fy) {
    throw new AccountingError(
      'NO_OPEN_PERIOD',
      `No fiscal year covers ${onDate.toISOString().slice(0, 10)}. Create it in Admin > Fiscal Years.`,
    )
  }
  return fy
}
