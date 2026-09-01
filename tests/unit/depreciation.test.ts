import { describe, expect, it } from 'vitest'

import { Prisma } from '@/generated/prisma/client'
import {
  depreciableAmount,
  monthlyCharge,
  netBookValue,
  projectSchedule,
} from '@/server/accounting/depreciation'

const d = (v: string | number) => new Prisma.Decimal(v)

function asset(over: Partial<Parameters<typeof monthlyCharge>[0]> = {}) {
  return {
    cost: d('120000'),
    salvageValue: d('0'),
    method: 'STRAIGHT_LINE' as const,
    usefulLifeMonths: 36,
    reducingRate: null,
    ...over,
  }
}

describe('straight line', () => {
  it('charges cost divided by useful life', () => {
    // 120,000 over 36 months = 3,333.33 a month.
    expect(monthlyCharge(asset(), d(0)).toFixed(2)).toBe('3333.33')
  })

  it('never depreciates below salvage value', () => {
    const a = asset({ salvageValue: d('20000') })
    expect(depreciableAmount(a).toFixed(2)).toBe('100000.00')
    // Already at the limit: nothing further is due.
    expect(monthlyCharge(a, d('100000')).toFixed(2)).toBe('0.00')
  })

  it('lets the final month absorb the rounding remainder', () => {
    const a = asset()
    const rows = projectSchedule(a)

    expect(rows).toHaveLength(36)
    // 36 x 3,333.33 = 119,999.88 — the last month takes the extra 0.12 so the
    // asset lands exactly on zero rather than 12 paisa short.
    expect(rows[34].charge).toBe('3333.33')
    expect(rows[35].charge).toBe('3333.45')
    expect(rows[35].accumulated).toBe('120000.00')
    expect(rows[35].closingNbv).toBe('0.00')
  })

  it('lands exactly on salvage value', () => {
    const rows = projectSchedule(asset({ salvageValue: d('20000'), usefulLifeMonths: 24 }))
    expect(rows[rows.length - 1].closingNbv).toBe('20000.00')
  })
})

describe('reducing balance', () => {
  it('charges a fraction of the current net book value', () => {
    const a = asset({ method: 'REDUCING_BALANCE', reducingRate: d('30') })
    // 120,000 x 30% / 12 = 3,000.00 in the first month.
    expect(monthlyCharge(a, d(0)).toFixed(2)).toBe('3000.00')
    // Once 20,000 is accumulated the base is 100,000, so the charge falls.
    expect(monthlyCharge(a, d('20000')).toFixed(2)).toBe('2500.00')
  })

  it('declines over time and still stops at the limit', () => {
    const rows = projectSchedule(
      asset({ method: 'REDUCING_BALANCE', reducingRate: d('30'), salvageValue: d('1000') }),
    )
    expect(Number(rows[0].charge)).toBeGreaterThan(Number(rows[10].charge))
    expect(rows[rows.length - 1].closingNbv).toBe('1000.00')
  })
})

describe('not depreciated', () => {
  it('charges nothing', () => {
    expect(monthlyCharge(asset({ method: 'NONE' }), d(0)).toFixed(2)).toBe('0.00')
    expect(projectSchedule(asset({ method: 'NONE' }))).toHaveLength(0)
  })
})

describe('net book value', () => {
  it('is cost less accumulated depreciation', () => {
    expect(netBookValue(d('120000'), d('45000')).toFixed(2)).toBe('75000.00')
  })
})
