import 'server-only'

import { formatNumber } from '@/server/accounting/numbering'
import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import type { ResetPolicy } from '@/generated/prisma/enums'

/** Numbering series — docs/modules/16-settings.md, Numbering section. */

export async function listSeries() {
  const [series, currentYear] = await Promise.all([
    prisma.documentSeries.findMany({
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
      include: { counters: true },
    }),
    prisma.fiscalYear.findFirst({ where: { status: 'OPEN' }, orderBy: { startDate: 'desc' } }),
  ])

  return series.map((row) => {
    const counter = row.counters.find(
      (c) => c.fiscalYearId === (currentYear?.id ?? '') || c.fiscalYearId === '__continuous__',
    )
    const nextSeq = counter?.nextSeq ?? 1
    const issued = nextSeq - 1

    return {
      key: row.key,
      name: row.name,
      scope: row.scope,
      prefix: row.prefix,
      padding: row.padding,
      resetPolicy: row.resetPolicy,
      isActive: row.isActive,
      issued,
      nextSeq,
      // What the next document will actually be called.
      preview: formatNumber({
        prefix: row.prefix,
        padding: row.padding,
        fiscalYearCode: row.resetPolicy === 'YEARLY' ? (currentYear?.code ?? '----') : null,
        seq: nextSeq,
      }),
    }
  })
}

/**
 * Update a series.
 *
 * Prefix, padding and reset policy are editable and take effect on the next
 * document — numbers already issued never change. The counter itself is not
 * editable once a number has been issued, because lowering it would produce
 * duplicate document numbers.
 */
export async function updateSeries(input: {
  key: string
  prefix: string
  padding: number
  resetPolicy: ResetPolicy
}) {
  const prefix = input.prefix.trim().toUpperCase()

  if (!/^[A-Z]{1,6}$/.test(prefix)) {
    throw new AccountingError('INVALID_LINE', 'Prefix must be 1–6 letters.')
  }
  if (input.padding < 1 || input.padding > 10) {
    throw new AccountingError('INVALID_LINE', 'Padding must be between 1 and 10.')
  }

  const clash = await prisma.documentSeries.findFirst({
    where: { prefix, key: { not: input.key } },
  })
  if (clash) {
    throw new AccountingError(
      'INVALID_LINE',
      `Prefix ${prefix} is already used by ${clash.name}. Document numbers must stay unambiguous.`,
    )
  }

  return prisma.documentSeries.update({
    where: { key: input.key },
    data: { prefix, padding: input.padding, resetPolicy: input.resetPolicy },
  })
}
