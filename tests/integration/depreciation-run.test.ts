import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { ACCOUNTS } from '@/server/accounting/accounts'
import { isAccountingError } from '@/server/accounting/errors'
import { prisma } from '@/server/db/client'
import { createAsset, disposeAsset } from '@/server/services/asset-service'
import { getPreview, runDepreciation } from '@/server/services/depreciation-service'

/**
 * The depreciation run, end to end against the database.
 *
 * The property that matters most: a period can be charged at most once, however
 * many times the button is pressed.
 */

const AUTHOR = 'test'
let categoryId: string
let periodId: string
let assetId: string

let assetName: string

beforeAll(async () => {
  const category = await prisma.assetCategory.findFirstOrThrow({
    where: { code: 'COMPUTER' },
  })
  categoryId = category.id

  // Posted vouchers cannot be deleted, so this test cannot clean up after
  // itself. Instead it claims a period nobody has depreciated yet and creates
  // its own asset, which keeps it re-runnable without touching prior results.
  const year = await prisma.fiscalYear.upsert({
    where: { code: '2728' },
    create: {
      name: 'FY2027-28',
      code: '2728',
      startDate: new Date(Date.UTC(2027, 6, 1)),
      endDate: new Date(Date.UTC(2028, 5, 30)),
    },
    update: {},
  })
  for (let i = 0; i < 12; i++) {
    const monthIndex = (6 + i) % 12
    const yearOffset = Math.floor((6 + i) / 12)
    const periodStart = new Date(Date.UTC(2027 + yearOffset, monthIndex, 1))
    const periodEnd = new Date(Date.UTC(2027 + yearOffset, monthIndex + 1, 0))
    await prisma.accountingPeriod.upsert({
      where: { fiscalYearId_seq: { fiscalYearId: year.id, seq: i + 1 } },
      create: {
        fiscalYearId: year.id,
        name: `Period ${i + 1}`,
        seq: i + 1,
        startDate: periodStart,
        endDate: periodEnd,
      },
      update: {},
    })
  }
  const periods = await prisma.accountingPeriod.findMany({
    where: { fiscalYearId: year.id },
    orderBy: { seq: 'asc' },
  })
  const runs = await prisma.depreciationRun.findMany({ select: { periodId: true } })
  const used = new Set(runs.map((r) => r.periodId))

  const free = periods.find((p) => !used.has(p.id))
  if (!free) throw new Error('No un-depreciated period left in FY2027-28 for this test.')
  periodId = free.id

  assetName = `Test server rack ${free.seq}`

  const asset = await createAsset({
    name: assetName,
    categoryId,
    acquiredOn: free.startDate,
    depreciationStartOn: free.startDate,
    cost: '360000',
    salvageValue: '0',
    method: 'STRAIGHT_LINE',
    usefulLifeMonths: 36,
    createdBy: AUTHOR,
  })
  assetId = asset.id
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('depreciation run', () => {
  it('previews the monthly charge', async () => {
    const preview = await getPreview(periodId)
    const row = preview.rows.find((r) => r.name === assetName)

    // 360,000 over 36 months = 10,000 a month.
    expect(row?.charge).toBe('10000.00')
    expect(row?.openingNbv).toBe('360000.00')
    expect(row?.closingNbv).toBe('350000.00')
  })

  it('posts one voucher and records the charge against the asset', async () => {
    const result = await runDepreciation({
      periodId,
      createdBy: AUTHOR,
      canPostToSoftClosed: true,
    })

    expect(result.voucherNo).toMatch(/^JV-2728-\d{5}$/)
    expect(Number(result.total)).toBeGreaterThanOrEqual(10000)

    const entry = await prisma.depreciationEntry.findUnique({
      where: { assetId_periodId: { assetId, periodId } },
    })
    expect(entry?.amount.toFixed(2)).toBe('10000.00')

    // Dr 6130 Depreciation Expense / Cr 1590 Accumulated Depreciation.
    const voucher = await prisma.journalEntry.findFirstOrThrow({
      where: { voucherNo: result.voucherNo },
      include: { lines: { include: { account: true } } },
    })
    expect(voucher.sourceType).toBe('DEPRECIATION')

    const debit = voucher.lines.find((l) => l.debit && !l.debit.isZero())
    const credit = voucher.lines.find((l) => l.credit && !l.credit.isZero())
    expect(debit?.account.code).toBe(ACCOUNTS.DEPRECIATION)
    expect(credit?.account.code).toBe(ACCOUNTS.ACCUMULATED_DEPRECIATION)
  })

  it('refuses to run the same period twice', async () => {
    await expect(
      runDepreciation({ periodId, createdBy: AUTHOR, canPostToSoftClosed: true }),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && /already been run/i.test(e.message),
    )
  })

  it('excludes an asset already charged in the period from the next preview', async () => {
    const preview = await getPreview(periodId)
    expect(preview.rows.find((r) => r.name === assetName)).toBeUndefined()
  })
})

describe('disposal', () => {
  it('removes cost and accumulated depreciation, booking the difference', async () => {
    // NBV is 360,000 - 10,000 = 350,000. Selling for 360,000 is a 10,000 gain.
    const result = await disposeAsset({
      assetId,
      disposedOn: new Date(Date.UTC(2028, 4, 15)),
      disposalType: 'SALE',
      proceeds: '360000',
      bankAccountCode: ACCOUNTS.BANK,
      createdBy: AUTHOR,
      canPostToSoftClosed: true,
    })

    expect(result.nbv).toBe('350000.00')
    expect(result.gain).toBe('10000.00')

    const voucher = await prisma.journalEntry.findFirstOrThrow({
      where: { voucherNo: result.voucherNo },
      include: { lines: { include: { account: true } } },
    })

    const byCode = new Map(
      voucher.lines.map((l) => [
        l.account.code,
        { debit: Number(l.debit ?? 0), credit: Number(l.credit ?? 0) },
      ]),
    )

    expect(byCode.get(ACCOUNTS.BANK)?.debit).toBe(360000)
    expect(byCode.get(ACCOUNTS.ACCUMULATED_DEPRECIATION)?.debit).toBe(10000)
    expect(byCode.get('1530')?.credit).toBe(360000)
    expect(byCode.get(ACCOUNTS.DISPOSAL_GAIN_LOSS)?.credit).toBe(10000)

    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } })
    expect(asset.status).toBe('DISPOSED')
  })

  it('refuses to dispose of the same asset twice', async () => {
    await expect(
      disposeAsset({
        assetId,
        disposedOn: new Date(Date.UTC(2028, 4, 20)),
        disposalType: 'SCRAP',
        proceeds: '0',
        bankAccountCode: ACCOUNTS.BANK,
        createdBy: AUTHOR,
        canPostToSoftClosed: true,
      }),
    ).rejects.toSatisfy(
      (e: unknown) => isAccountingError(e) && /already been disposed/i.test(e.message),
    )
  })
})
