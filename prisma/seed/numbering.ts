import type { PrismaClient } from '../../src/generated/prisma/client'
import { formatNumber } from '../../src/lib/numbering'

/**
 * The seed's copy of `allocateNumber` (src/server/accounting/numbering.ts),
 * which is `server-only` and cannot load under tsx. Same counter upsert, so a
 * seeded STU-2627-00001 moves the counter on and the first real student gets
 * 00002 rather than a unique-constraint error.
 */
export async function allocateSeedNumber(
  prisma: PrismaClient,
  seriesKey: string,
  fiscalYear: { id: string; code: string },
): Promise<string> {
  const series = await prisma.documentSeries.findUniqueOrThrow({ where: { key: seriesKey } })
  const fiscalYearId = series.resetPolicy === 'YEARLY' ? fiscalYear.id : '__continuous__'

  const counter = await prisma.documentSeriesCounter.upsert({
    where: { seriesKey_fiscalYearId: { seriesKey, fiscalYearId } },
    create: { seriesKey, fiscalYearId, nextSeq: 2 },
    update: { nextSeq: { increment: 1 } },
    select: { nextSeq: true },
  })

  return formatNumber({
    prefix: series.prefix,
    padding: series.padding,
    fiscalYearCode: series.resetPolicy === 'YEARLY' ? fiscalYear.code : null,
    seq: counter.nextSeq - 1,
  })
}
