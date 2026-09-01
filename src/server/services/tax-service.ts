import 'server-only'

import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import type { TaxKind } from '@/generated/prisma/enums'

/**
 * Tax codes — docs/modules/16-settings.md, Tax section.
 *
 * Effective-dated by design. Changing a rate creates a NEW row and closes the
 * previous one; editing a rate in place is not offered anywhere, because it
 * would silently restate the tax on every document already issued.
 */

export async function listTaxCodes() {
  const rows = await prisma.taxCode.findMany({
    orderBy: [{ code: 'asc' }, { effectiveFrom: 'desc' }],
  })

  const today = new Date()

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind,
    country: row.country,
    rate: row.rate.toString(),
    glAccountCode: row.glAccountCode,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
    isActive: row.isActive,
    isCurrent:
      row.effectiveFrom <= today && (row.effectiveTo === null || row.effectiveTo > today),
  }))
}

/** The rate that applied on a given date — how postings must resolve it. */
export async function getTaxCodeAsOf(code: string, date: Date) {
  return prisma.taxCode.findFirst({
    where: {
      code,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  })
}

/**
 * Add a new dated version of a tax code, closing the previous one on the same
 * date so there is never a gap or an overlap.
 */
export async function addTaxRateVersion(input: {
  code: string
  name: string
  kind: TaxKind
  country?: string | null
  rate: string
  glAccountCode: string
  effectiveFrom: Date
  createdBy: string
}) {
  const rate = Number(input.rate)
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new AccountingError('INVALID_LINE', 'Rate must be between 0 and 100.')
  }

  const account = await prisma.account.findUnique({
    where: { code: input.glAccountCode },
  })
  if (!account) {
    throw new AccountingError(
      'UNKNOWN_ACCOUNT',
      `Account ${input.glAccountCode} does not exist.`,
    )
  }
  if (account.isGroup) {
    throw new AccountingError(
      'GROUP_ACCOUNT',
      `Account ${input.glAccountCode} is a group heading and cannot receive tax postings.`,
    )
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.taxCode.findFirst({
      where: { code: input.code, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    })

    if (open && open.effectiveFrom >= input.effectiveFrom) {
      throw new AccountingError(
        'INVALID_LINE',
        `${input.code} already has a version from ${open.effectiveFrom
          .toISOString()
          .slice(0, 10)}. Choose a later date.`,
      )
    }

    if (open) {
      await tx.taxCode.update({
        where: { id: open.id },
        data: { effectiveTo: input.effectiveFrom },
      })
    }

    return tx.taxCode.create({
      data: {
        code: input.code,
        name: input.name,
        kind: input.kind,
        country: input.country ?? null,
        rate: input.rate,
        glAccountCode: input.glAccountCode,
        effectiveFrom: input.effectiveFrom,
        createdBy: input.createdBy,
      },
    })
  })
}
