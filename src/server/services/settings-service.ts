import 'server-only'

import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import type { SettingSection } from '@/generated/prisma/enums'

/**
 * Settings — docs/modules/16-settings.md.
 *
 * Two rules do the work here:
 *   1. Values that affect posted documents are effective-dated, never
 *      overwritten, so a reprint of an old document shows what applied then.
 *   2. Settings that prior postings depend on lock permanently once used.
 */

export type SettingView = {
  key: string
  section: string
  value: string
  dataType: string
  isLocked: boolean
  lockReason: string | null
  updatedAt: string
  updatedBy: string | null
}

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row?.value ?? null
}

/** The value that applied on a given date — for anything touching old documents. */
export async function getSettingAsOf(key: string, date: Date): Promise<string | null> {
  const row = await prisma.settingHistory.findFirst({
    where: {
      key,
      effectiveFrom: { lte: date },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  })
  return row?.value ?? null
}

/**
 * Recompute which settings are locked. A lock is derived from the data, never
 * hand-set: base currency and timezone lock on the first posting, fiscal year
 * start once a year exists.
 */
export async function refreshLocks(): Promise<void> {
  const [voucherCount, yearCount] = await Promise.all([
    prisma.journalEntry.count(),
    prisma.fiscalYear.count(),
  ])

  const locks: { key: string; locked: boolean; reason: string }[] = [
    {
      key: 'company.baseCurrency',
      locked: voucherCount > 0,
      reason: `${voucherCount} voucher(s) posted in this currency`,
    },
    {
      key: 'company.timezone',
      locked: voucherCount > 0,
      reason: `${voucherCount} voucher(s) posted — period boundaries depend on it`,
    },
    {
      key: 'fiscalYear.startMonthDay',
      locked: yearCount > 0,
      reason: `${yearCount} fiscal year(s) already built from it`,
    },
  ]

  for (const lock of locks) {
    await prisma.setting.updateMany({
      where: { key: lock.key },
      data: { isLocked: lock.locked, lockReason: lock.locked ? lock.reason : null },
    })
  }
}

export async function listSettings(section: SettingSection): Promise<SettingView[]> {
  await refreshLocks()

  const rows = await prisma.setting.findMany({
    where: { section },
    orderBy: { key: 'asc' },
  })

  return rows.map((row) => ({
    key: row.key,
    section: row.section,
    value: row.value,
    dataType: row.dataType,
    isLocked: row.isLocked,
    lockReason: row.lockReason,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
  }))
}

/**
 * Change a setting. Writes a dated history row and closes the previous one, so
 * the change is both auditable and resolvable by document date.
 */
export async function updateSetting(input: {
  key: string
  value: string
  effectiveFrom: Date
  changedBy: string
  note?: string
}) {
  const setting = await prisma.setting.findUnique({ where: { key: input.key } })
  if (!setting) throw new AccountingError('INVALID_LINE', `Unknown setting ${input.key}.`)

  if (setting.isLocked) {
    throw new AccountingError(
      'INVALID_LINE',
      `${input.key} is locked: ${setting.lockReason ?? 'it is already in use'}.`,
    )
  }

  return prisma.$transaction(async (tx) => {
    const open = await tx.settingHistory.findFirst({
      where: { key: input.key, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    })

    if (open && open.effectiveFrom >= input.effectiveFrom) {
      throw new AccountingError(
        'INVALID_LINE',
        `A value already applies from ${open.effectiveFrom.toISOString().slice(0, 10)}. Choose a later date.`,
      )
    }

    if (open) {
      await tx.settingHistory.update({
        where: { id: open.id },
        data: { effectiveTo: input.effectiveFrom },
      })
    }

    await tx.settingHistory.create({
      data: {
        key: input.key,
        value: input.value,
        effectiveFrom: input.effectiveFrom,
        changedBy: input.changedBy,
        note: input.note,
      },
    })

    return tx.setting.update({
      where: { key: input.key },
      data: { value: input.value, updatedBy: input.changedBy },
    })
  })
}

export async function getSettingHistory(key: string) {
  const rows = await prisma.settingHistory.findMany({
    where: { key },
    orderBy: { effectiveFrom: 'desc' },
    take: 20,
  })

  return rows.map((row) => ({
    value: row.value,
    effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: row.effectiveTo?.toISOString().slice(0, 10) ?? null,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString().slice(0, 16).replace('T', ' '),
    note: row.note,
  }))
}
