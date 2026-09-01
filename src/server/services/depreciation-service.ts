import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import { monthlyCharge, netBookValue } from '@/server/accounting/depreciation'
import { AccountingError } from '@/server/accounting/errors'
import { postEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'

/**
 * Monthly depreciation run — posting matrix row 38.
 *
 * One run per period, one voucher per run: Dr expense account, Cr accumulated
 * depreciation, grouped by the accounts each category maps to. The unique index
 * on (assetId, periodId) is what makes a re-run safe — an asset can be charged
 * at most once in any period, no matter how many times the button is pressed.
 */

const ZERO = new Prisma.Decimal(0)

export async function listRuns() {
  const runs = await prisma.depreciationRun.findMany({
    orderBy: { runDate: 'desc' },
    include: { entries: { select: { id: true } } },
  })

  const periods = await prisma.accountingPeriod.findMany({
    where: { id: { in: runs.map((r) => r.periodId) } },
    select: { id: true, name: true },
  })
  const periodName = new Map(periods.map((p) => [p.id, p.name]))

  return runs.map((run) => ({
    id: run.id,
    period: periodName.get(run.periodId) ?? '—',
    runDate: run.runDate.toISOString().slice(0, 10),
    totalAmount: run.totalAmount.toFixed(2),
    assetCount: run.assetCount,
    voucherNo: run.voucherNo,
    journalEntryId: run.journalEntryId,
    createdBy: run.createdBy,
  }))
}

/**
 * Periods that can still be depreciated, **oldest first**.
 *
 * Order matters: depreciation runs month by month, and each month's charge
 * depends on what previous months already posted (obviously so for reducing
 * balance). Offering the newest period first would invite skipping months.
 */
export async function listRunnablePeriods() {
  const [periods, runs] = await Promise.all([
    prisma.accountingPeriod.findMany({
      where: { status: { not: 'CLOSED' }, fiscalYear: { status: 'OPEN' } },
      orderBy: [{ startDate: 'asc' }],
      include: { fiscalYear: { select: { name: true } } },
      take: 36,
    }),
    prisma.depreciationRun.findMany({ select: { periodId: true } }),
  ])

  const done = new Set(runs.map((r) => r.periodId))
  const today = new Date()

  return periods.map((period) => ({
    id: period.id,
    name: `${period.name} (${period.fiscalYear.name})`,
    endDate: period.endDate.toISOString().slice(0, 10),
    alreadyRun: done.has(period.id),
    // A period that has not ended yet is offered but never defaulted to.
    isFuture: period.endDate > today,
  }))
}

export type PreviewRow = {
  assetId: string
  code: string
  name: string
  expenseAccount: string
  accumulatedAccount: string
  openingNbv: Prisma.Decimal
  charge: Prisma.Decimal
  closingNbv: Prisma.Decimal
  fullyDepreciated: boolean
}

/**
 * What a run would charge, without posting anything.
 *
 * Assets are eligible when they are ACTIVE, their depreciation start date falls
 * on or before the period end, and they have not already been charged in that
 * period.
 */
export async function previewRun(periodId: string): Promise<PreviewRow[]> {
  const period = await prisma.accountingPeriod.findUnique({ where: { id: periodId } })
  if (!period) throw new AccountingError('NO_OPEN_PERIOD', 'Period not found.')

  const [assets, alreadyCharged] = await Promise.all([
    prisma.asset.findMany({
      where: {
        status: 'ACTIVE',
        depreciationStartOn: { lte: period.endDate },
      },
      include: { category: true, entries: { select: { amount: true, periodId: true } } },
      orderBy: { code: 'asc' },
    }),
    prisma.depreciationEntry.findMany({
      where: { periodId },
      select: { assetId: true },
    }),
  ])

  const charged = new Set(alreadyCharged.map((e) => e.assetId))

  const rows: PreviewRow[] = []

  for (const asset of assets) {
    if (charged.has(asset.id)) continue

    const accumulated = asset.entries.reduce(
      (sum, e) => sum.add(new Prisma.Decimal(e.amount)),
      ZERO,
    )

    const charge = monthlyCharge(
      {
        cost: asset.cost,
        salvageValue: asset.salvageValue,
        method: asset.method,
        usefulLifeMonths: asset.usefulLifeMonths,
        reducingRate: asset.reducingRate,
      },
      accumulated,
    )

    if (charge.lte(ZERO)) continue

    const openingNbv = netBookValue(asset.cost, accumulated)
    rows.push({
      assetId: asset.id,
      code: asset.code,
      name: asset.name,
      expenseAccount: asset.category.expenseAccountCode,
      accumulatedAccount: asset.category.accumulatedAccountCode,
      openingNbv,
      charge,
      closingNbv: openingNbv.sub(charge),
      fullyDepreciated: accumulated.add(charge).gte(asset.cost.sub(asset.salvageValue)),
    })
  }

  return rows
}

export async function getPreview(periodId: string) {
  const rows = await previewRun(periodId)
  return {
    rows: rows.map((row) => ({
      code: row.code,
      name: row.name,
      openingNbv: row.openingNbv.toFixed(2),
      charge: row.charge.toFixed(2),
      closingNbv: row.closingNbv.toFixed(2),
      fullyDepreciated: row.fullyDepreciated,
    })),
    total: rows.reduce((sum, r) => sum.add(r.charge), ZERO).toFixed(2),
  }
}

/** Post the run. One voucher, one run row, one entry per asset. */
export async function runDepreciation(input: {
  periodId: string
  createdBy: string
  canPostToSoftClosed: boolean
}) {
  const existing = await prisma.depreciationRun.findUnique({
    where: { periodId: input.periodId },
  })
  if (existing) {
    throw new AccountingError(
      'INVALID_LINE',
      `Depreciation has already been run for this period (${existing.voucherNo ?? 'posted'}).`,
    )
  }

  const period = await prisma.accountingPeriod.findUnique({
    where: { id: input.periodId },
  })
  if (!period) throw new AccountingError('NO_OPEN_PERIOD', 'Period not found.')

  const rows = await previewRun(input.periodId)
  if (rows.length === 0) {
    throw new AccountingError(
      'EMPTY_ENTRY',
      'Nothing to depreciate in this period — no active asset has a charge remaining.',
    )
  }

  // Group by account pair so the voucher carries one line per account rather
  // than one per asset. Asset-level detail lives in the register.
  const expenseTotals = new Map<string, Prisma.Decimal>()
  const accumulatedTotals = new Map<string, Prisma.Decimal>()

  for (const row of rows) {
    expenseTotals.set(
      row.expenseAccount,
      (expenseTotals.get(row.expenseAccount) ?? ZERO).add(row.charge),
    )
    accumulatedTotals.set(
      row.accumulatedAccount,
      (accumulatedTotals.get(row.accumulatedAccount) ?? ZERO).add(row.charge),
    )
  }

  const total = rows.reduce((sum, r) => sum.add(r.charge), ZERO)

  return prisma.$transaction(async (tx) => {
    const voucher = await postEntry(tx, {
      voucherType: 'JV',
      // Depreciation belongs to the period it covers, so it is dated on the
      // last day of that period, not the day the button was pressed.
      entryDate: period.endDate,
      narration: `Depreciation for ${period.name}`,
      sourceType: 'DEPRECIATION',
      sourceId: period.id,
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        ...[...expenseTotals].map(([accountCode, amount]) => ({
          accountCode,
          debit: amount.toFixed(2),
          lineNarration: `Depreciation ${period.name}`,
        })),
        ...[...accumulatedTotals].map(([accountCode, amount]) => ({
          accountCode,
          credit: amount.toFixed(2),
          lineNarration: `Depreciation ${period.name}`,
        })),
      ],
    })

    const run = await tx.depreciationRun.create({
      data: {
        periodId: period.id,
        runDate: period.endDate,
        totalAmount: total.toFixed(2),
        assetCount: rows.length,
        journalEntryId: voucher.id,
        voucherNo: voucher.voucherNo,
        createdBy: input.createdBy,
      },
    })

    await tx.depreciationEntry.createMany({
      data: rows.map((row) => ({
        runId: run.id,
        assetId: row.assetId,
        periodId: period.id,
        amount: row.charge.toFixed(2),
        openingNbv: row.openingNbv.toFixed(2),
        closingNbv: row.closingNbv.toFixed(2),
      })),
    })

    // Assets that reached their limit this month stop being picked up.
    const finished = rows.filter((r) => r.fullyDepreciated).map((r) => r.assetId)
    if (finished.length > 0) {
      await tx.asset.updateMany({
        where: { id: { in: finished } },
        data: { status: 'FULLY_DEPRECIATED' },
      })
    }

    return {
      voucherNo: voucher.voucherNo,
      total: total.toFixed(2),
      assetCount: rows.length,
      fullyDepreciated: finished.length,
    }
  })
}
