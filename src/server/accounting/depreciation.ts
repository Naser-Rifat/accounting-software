import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { DepreciationMethod } from '@/generated/prisma/enums'

/**
 * Depreciation arithmetic.
 *
 * Pure functions with no database access, so the maths can be tested directly —
 * which matters, because a rounding mistake here quietly misstates both profit
 * and the balance sheet every single month.
 */

const ZERO = new Prisma.Decimal(0)

export type DepreciableAsset = {
  cost: Prisma.Decimal
  salvageValue: Prisma.Decimal
  method: DepreciationMethod
  usefulLifeMonths: number
  reducingRate: Prisma.Decimal | null
}

/** The most an asset may ever be depreciated: cost less residual value. */
export function depreciableAmount(asset: DepreciableAsset): Prisma.Decimal {
  const amount = asset.cost.sub(asset.salvageValue)
  return amount.isNegative() ? ZERO : amount
}

/**
 * One month's charge, given what has already been posted.
 *
 * Always capped so accumulated depreciation can never exceed the depreciable
 * amount — the final month absorbs the rounding remainder rather than leaving a
 * few paisa stranded, which is what makes an asset land exactly on its salvage
 * value instead of near it.
 */
export function monthlyCharge(
  asset: DepreciableAsset,
  accumulated: Prisma.Decimal,
): Prisma.Decimal {
  if (asset.method === 'NONE') return ZERO

  const limit = depreciableAmount(asset)
  const remaining = limit.sub(accumulated)
  if (remaining.lte(ZERO)) return ZERO

  let charge: Prisma.Decimal

  if (asset.method === 'STRAIGHT_LINE') {
    if (asset.usefulLifeMonths <= 0) return ZERO
    charge = limit.div(asset.usefulLifeMonths)
  } else {
    // Reducing balance: this month's charge is a fraction of the current net
    // book value, so it falls as the asset ages.
    const rate = asset.reducingRate ?? ZERO
    if (rate.lte(ZERO)) return ZERO
    const nbv = asset.cost.sub(accumulated)
    charge = nbv.mul(rate).div(100).div(12)
  }

  charge = charge.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)

  // Never overshoot.
  if (charge.gte(remaining)) return remaining

  // Absorb the tail in the final month rather than spilling into an extra one.
  // 120,000 over 36 months rounds to 3,333.33, which leaves 0.12 outstanding
  // after 36 charges — without this the asset would take 37 months to clear,
  // and reducing balance would trail tiny amounts for years.
  if (remaining.sub(charge).lt(charge)) return remaining

  return charge
}

/** Cost less depreciation posted to date. */
export function netBookValue(
  cost: Prisma.Decimal,
  accumulated: Prisma.Decimal,
): Prisma.Decimal {
  return cost.sub(accumulated)
}

/**
 * Full forward schedule for an asset, for the detail screen. Projected only —
 * the ledger remains the record of what was actually charged.
 */
export function projectSchedule(
  asset: DepreciableAsset,
  maxMonths = 600,
): { month: number; charge: string; accumulated: string; closingNbv: string }[] {
  const rows: { month: number; charge: string; accumulated: string; closingNbv: string }[] = []
  let accumulated = ZERO

  for (let month = 1; month <= maxMonths; month++) {
    const charge = monthlyCharge(asset, accumulated)
    if (charge.lte(ZERO)) break

    accumulated = accumulated.add(charge)
    rows.push({
      month,
      charge: charge.toFixed(2),
      accumulated: accumulated.toFixed(2),
      closingNbv: netBookValue(asset.cost, accumulated).toFixed(2),
    })
  }

  return rows
}
