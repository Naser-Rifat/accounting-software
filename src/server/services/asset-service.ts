import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { DepreciationMethod, DisposalType } from '@/generated/prisma/enums'
import { ACCOUNTS } from '@/server/accounting/accounts'
import {
  depreciableAmount,
  netBookValue,
  projectSchedule,
} from '@/server/accounting/depreciation'
import { AccountingError } from '@/server/accounting/errors'
import { allocateNumber } from '@/server/accounting/numbering'
import { resolvePeriod } from '@/server/accounting/period'
import { postEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'

/** Asset register: create, list, view and dispose. */

const ZERO = new Prisma.Decimal(0)

export async function listCategories() {
  return prisma.assetCategory.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' },
  })
}

/** Accumulated depreciation actually posted, per asset. */
async function accumulatedByAsset(): Promise<Map<string, Prisma.Decimal>> {
  const rows = await prisma.depreciationEntry.groupBy({
    by: ['assetId'],
    _sum: { amount: true },
  })
  return new Map(
    rows.map((row) => [row.assetId, new Prisma.Decimal(row._sum.amount ?? 0)]),
  )
}

export async function listAssets() {
  const [assets, accumulated] = await Promise.all([
    prisma.asset.findMany({
      orderBy: { code: 'asc' },
      include: { category: true },
    }),
    accumulatedByAsset(),
  ])

  const rows = assets.map((asset) => {
    const acc = accumulated.get(asset.id) ?? ZERO
    return {
      id: asset.id,
      code: asset.code,
      name: asset.name,
      category: asset.category.name,
      acquiredOn: asset.acquiredOn.toISOString().slice(0, 10),
      cost: asset.cost.toFixed(2),
      accumulated: acc.toFixed(2),
      netBookValue: netBookValue(asset.cost, acc).toFixed(2),
      method: asset.method,
      usefulLifeMonths: asset.usefulLifeMonths,
      status: asset.status,
    }
  })

  return {
    rows,
    totals: {
      cost: rows.reduce((s, r) => s + Number(r.cost), 0).toFixed(2),
      accumulated: rows.reduce((s, r) => s + Number(r.accumulated), 0).toFixed(2),
      netBookValue: rows.reduce((s, r) => s + Number(r.netBookValue), 0).toFixed(2),
    },
  }
}

export async function getAsset(id: string) {
  const asset = await prisma.asset.findUnique({
    where: { id },
    include: {
      category: true,
      entries: {
        orderBy: { periodId: 'asc' },
        include: { run: { select: { runDate: true, voucherNo: true } } },
      },
    },
  })
  if (!asset) return null

  const acc = asset.entries.reduce(
    (sum, e) => sum.add(new Prisma.Decimal(e.amount)),
    ZERO,
  )

  const depreciable = {
    cost: asset.cost,
    salvageValue: asset.salvageValue,
    method: asset.method,
    usefulLifeMonths: asset.usefulLifeMonths,
    reducingRate: asset.reducingRate,
  }

  return {
    id: asset.id,
    code: asset.code,
    name: asset.name,
    description: asset.description,
    category: asset.category.name,
    accounts: {
      asset: asset.category.assetAccountCode,
      accumulated: asset.category.accumulatedAccountCode,
      expense: asset.category.expenseAccountCode,
    },
    acquiredOn: asset.acquiredOn.toISOString().slice(0, 10),
    depreciationStartOn: asset.depreciationStartOn.toISOString().slice(0, 10),
    cost: asset.cost.toFixed(2),
    salvageValue: asset.salvageValue.toFixed(2),
    depreciableAmount: depreciableAmount(depreciable).toFixed(2),
    method: asset.method,
    usefulLifeMonths: asset.usefulLifeMonths,
    reducingRate: asset.reducingRate?.toFixed(2) ?? null,
    status: asset.status,
    disposedOn: asset.disposedOn?.toISOString().slice(0, 10) ?? null,
    disposalType: asset.disposalType,
    disposalProceeds: asset.disposalProceeds?.toFixed(2) ?? null,
    accumulated: acc.toFixed(2),
    netBookValue: netBookValue(asset.cost, acc).toFixed(2),
    posted: asset.entries.map((entry) => ({
      periodId: entry.periodId,
      runDate: entry.run.runDate.toISOString().slice(0, 10),
      voucherNo: entry.run.voucherNo,
      amount: new Prisma.Decimal(entry.amount).toFixed(2),
      closingNbv: new Prisma.Decimal(entry.closingNbv).toFixed(2),
    })),
    projected: projectSchedule(depreciable).slice(0, 240),
  }
}

/**
 * Add an asset to the register.
 *
 * This does NOT post the purchase — an asset normally arrives through a purchase
 * bill or payment that already debited 15xx. Registering it here would double
 * the cost. The register describes what the ledger already holds.
 */
export async function createAsset(input: {
  name: string
  description?: string | null
  categoryId: string
  acquiredOn: Date
  cost: string
  salvageValue: string
  method: DepreciationMethod
  usefulLifeMonths: number
  reducingRate?: string | null
  depreciationStartOn: Date
  createdBy: string
}) {
  const cost = new Prisma.Decimal(input.cost)
  const salvage = new Prisma.Decimal(input.salvageValue || 0)

  if (cost.lte(ZERO)) {
    throw new AccountingError('INVALID_LINE', 'Cost must be greater than zero.')
  }
  if (salvage.gte(cost)) {
    throw new AccountingError(
      'INVALID_LINE',
      'Salvage value must be less than cost, or there is nothing to depreciate.',
    )
  }
  if (input.method === 'STRAIGHT_LINE' && input.usefulLifeMonths <= 0) {
    throw new AccountingError('INVALID_LINE', 'Useful life must be at least one month.')
  }
  if (input.method === 'REDUCING_BALANCE' && Number(input.reducingRate ?? 0) <= 0) {
    throw new AccountingError(
      'INVALID_LINE',
      'Reducing balance needs an annual rate greater than zero.',
    )
  }

  const category = await prisma.assetCategory.findUnique({
    where: { id: input.categoryId },
  })
  if (!category) throw new AccountingError('INVALID_LINE', 'Unknown asset category.')

  return prisma.$transaction(async (tx) => {
    const period = await resolvePeriod(tx, input.acquiredOn, { canPostToSoftClosed: true })
    const number = await allocateNumber(tx, 'FA', period.fiscalYearId, period.fiscalYearCode)

    return tx.asset.create({
      data: {
        code: number.formatted,
        name: input.name,
        description: input.description ?? null,
        categoryId: input.categoryId,
        acquiredOn: input.acquiredOn,
        cost: input.cost,
        salvageValue: input.salvageValue || '0',
        method: input.method,
        usefulLifeMonths: input.usefulLifeMonths,
        reducingRate: input.reducingRate || null,
        depreciationStartOn: input.depreciationStartOn,
        createdBy: input.createdBy,
      },
    })
  })
}

/**
 * Dispose of an asset — sale, scrap or write-off.
 *
 * Removes cost and its accumulated depreciation from the balance sheet, brings
 * in any proceeds, and books the difference as gain or loss. The asset stays in
 * the register: its history is part of the audit trail.
 */
export async function disposeAsset(input: {
  assetId: string
  disposedOn: Date
  disposalType: DisposalType
  proceeds: string
  bankAccountCode: string
  createdBy: string
  canPostToSoftClosed: boolean
}) {
  const asset = await prisma.asset.findUnique({
    where: { id: input.assetId },
    include: { category: true, entries: true },
  })
  if (!asset) throw new AccountingError('INVALID_LINE', 'Asset not found.')
  if (asset.status === 'DISPOSED' || asset.status === 'WRITTEN_OFF') {
    throw new AccountingError('INVALID_LINE', `${asset.code} has already been disposed.`)
  }

  const accumulated = asset.entries.reduce(
    (sum, e) => sum.add(new Prisma.Decimal(e.amount)),
    ZERO,
  )
  const proceeds = new Prisma.Decimal(input.proceeds || 0)
  const nbv = netBookValue(asset.cost, accumulated)
  // Proceeds above net book value are a gain; below, a loss.
  const gain = proceeds.sub(nbv)

  const lines: {
    accountCode: string
    debit?: string
    credit?: string
    lineNarration?: string
  }[] = []

  if (proceeds.gt(ZERO)) {
    lines.push({
      accountCode: input.bankAccountCode,
      debit: proceeds.toFixed(2),
      lineNarration: 'Disposal proceeds',
    })
  }
  if (accumulated.gt(ZERO)) {
    lines.push({
      accountCode: asset.category.accumulatedAccountCode,
      debit: accumulated.toFixed(2),
      lineNarration: 'Accumulated depreciation removed',
    })
  }
  lines.push({
    accountCode: asset.category.assetAccountCode,
    credit: asset.cost.toFixed(2),
    lineNarration: 'Asset cost removed',
  })

  if (!gain.isZero()) {
    lines.push(
      gain.isPositive()
        ? {
            accountCode: ACCOUNTS.DISPOSAL_GAIN_LOSS,
            credit: gain.toFixed(2),
            lineNarration: 'Gain on disposal',
          }
        : {
            accountCode: ACCOUNTS.DISPOSAL_GAIN_LOSS,
            debit: gain.abs().toFixed(2),
            lineNarration: 'Loss on disposal',
          },
    )
  }

  return prisma.$transaction(async (tx) => {
    const voucher = await postEntry(tx, {
      voucherType: 'JV',
      entryDate: input.disposedOn,
      narration: `Disposal of ${asset.code} ${asset.name} (${input.disposalType.toLowerCase()})`,
      sourceType: 'MANUAL',
      sourceId: asset.id,
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines,
    })

    await tx.asset.update({
      where: { id: asset.id },
      data: {
        status: input.disposalType === 'SALE' ? 'DISPOSED' : 'WRITTEN_OFF',
        disposedOn: input.disposedOn,
        disposalType: input.disposalType,
        disposalProceeds: proceeds.toFixed(2),
        disposalEntryId: voucher.id,
      },
    })

    return { voucherNo: voucher.voucherNo, gain: gain.toFixed(2), nbv: nbv.toFixed(2) }
  })
}
