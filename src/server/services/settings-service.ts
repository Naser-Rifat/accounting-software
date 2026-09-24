import 'server-only'

import { SETTING_OPTIONS } from '@/config/app'
import type { SettingSection } from '@/generated/prisma/enums'
import { validateSettingValue } from '@/lib/validation/settings'
import { AccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { recordAudit } from '@/server/services/audit-service'

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
  options: readonly string[] | null
}

const toDay = (d: Date) => d.toISOString().slice(0, 10)

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
      reason: `${voucherCount} voucher(s) posted — every amount was converted at this currency`,
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

function toView(row: {
  key: string
  section: string
  value: string
  dataType: string
  isLocked: boolean
  lockReason: string | null
  updatedAt: Date
  updatedBy: string | null
}): SettingView {
  return {
    key: row.key,
    section: row.section,
    value: row.value,
    dataType: row.dataType,
    isLocked: row.isLocked,
    lockReason: row.lockReason,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy: row.updatedBy,
    options: SETTING_OPTIONS[row.key] ?? null,
  }
}

export async function listSettings(section: SettingSection): Promise<SettingView[]> {
  await refreshLocks()
  const rows = await prisma.setting.findMany({ where: { section }, orderBy: { key: 'asc' } })
  return rows.map(toView)
}

/** Every setting, for the hub's search. */
export async function listAllSettings(): Promise<SettingView[]> {
  await refreshLocks()
  const rows = await prisma.setting.findMany({ orderBy: [{ section: 'asc' }, { key: 'asc' }] })
  return rows.map(toView)
}

/**
 * Change a setting. Writes a dated history row and closes the previous one, so
 * the change is both auditable and resolvable by document date.
 *
 * `Setting.value` is the cache of what applies *today*: a change scheduled for
 * a future date is recorded in history but does not replace it yet.
 */
export async function updateSetting(input: {
  key: string
  value: string
  effectiveFrom: Date
  changedBy: string
  note?: string
}) {
  // Locks are derived from the ledger; recompute before trusting the cache, or
  // a direct POST could change the base currency after the first posting.
  await refreshLocks()

  const setting = await prisma.setting.findUnique({ where: { key: input.key } })
  if (!setting) throw new AccountingError('VALIDATION', `Unknown setting ${input.key}.`)

  if (setting.isLocked) {
    throw new AccountingError(
      'VALIDATION',
      `${input.key} is locked: ${setting.lockReason ?? 'it is already in use'}.`,
    )
  }

  const value = input.value.trim()
  const problem = validateSettingValue(input.key, setting.dataType, value)
  if (problem) throw new AccountingError('VALIDATION', `${input.key}: ${problem}`)

  const effectiveFrom = new Date(`${toDay(input.effectiveFrom)}T00:00:00.000Z`)
  const today = new Date(`${toDay(new Date())}T00:00:00.000Z`)
  const appliesNow = effectiveFrom <= today

  return prisma.$transaction(async (tx) => {
    const open = await tx.settingHistory.findFirst({
      where: { key: input.key, effectiveTo: null },
      orderBy: { effectiveFrom: 'desc' },
    })

    if (open && open.effectiveFrom > effectiveFrom) {
      throw new AccountingError(
        'VALIDATION',
        `A value already applies from ${toDay(open.effectiveFrom)}. Choose that date or a later one.`,
      )
    }

    if (open && open.effectiveFrom.getTime() === effectiveFrom.getTime()) {
      // Second change on the same day (a typo, say): amend the day's row rather
      // than refuse. The audit log still records both changes.
      await tx.settingHistory.update({
        where: { id: open.id },
        data: { value, changedBy: input.changedBy, changedAt: new Date(), note: input.note },
      })
    } else {
      if (open) {
        await tx.settingHistory.update({ where: { id: open.id }, data: { effectiveTo: effectiveFrom } })
      }
      await tx.settingHistory.create({
        data: { key: input.key, value, effectiveFrom, changedBy: input.changedBy, note: input.note },
      })
    }

    const updated = appliesNow
      ? await tx.setting.update({
          where: { key: input.key },
          data: { value, updatedBy: input.changedBy },
        })
      : setting

    await recordAudit(tx, {
      actor: { username: input.changedBy },
      action: 'SETTING_CHANGED',
      entity: 'Setting',
      entityId: input.key,
      before: { value: setting.value },
      after: { value, effectiveFrom: toDay(effectiveFrom), appliesNow, note: input.note ?? null },
    })

    return updated
  })
}

export async function getSettingHistory(key: string) {
  const rows = await prisma.settingHistory.findMany({
    where: { key },
    orderBy: { effectiveFrom: 'desc' },
    take: 20,
  })
  return rows.map(historyView)
}

/** The latest changes across all keys (or one section's keys) — the hub's "changed recently". */
export async function listRecentSettingChanges(limit = 10, section?: SettingSection) {
  const rows = await prisma.settingHistory.findMany({
    where: section ? { setting: { section } } : {},
    orderBy: { changedAt: 'desc' },
    take: limit,
  })
  return rows.map(historyView)
}

function historyView(row: {
  key: string
  value: string
  effectiveFrom: Date
  effectiveTo: Date | null
  changedBy: string
  changedAt: Date
  note: string | null
}) {
  return {
    key: row.key,
    value: row.value,
    effectiveFrom: toDay(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? toDay(row.effectiveTo) : null,
    changedBy: row.changedBy,
    changedAt: row.changedAt.toISOString().slice(0, 16).replace('T', ' '),
    note: row.note,
  }
}
