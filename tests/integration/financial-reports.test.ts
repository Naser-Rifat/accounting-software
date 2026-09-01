import { afterAll, describe, expect, it } from 'vitest'

import { prisma } from '@/server/db/client'
import {
  getBalanceSheet,
  getCashFlow,
  getDayBook,
  getFxGainLoss,
  getProfitAndLoss,
  getVatSummary,
  getWithholding,
} from '@/server/services/financial-reports-service'

/**
 * The statutory reports must tie out against the ledger they are drawn from.
 *
 * These are the assertions an auditor makes: the balance sheet balances, the
 * P&L sections add up to the ledger's own net result, and cash flow reconciles
 * opening to closing. If any of these fail, the reports cannot be trusted no
 * matter how well they render.
 */

const WIDE_FROM = new Date(Date.UTC(2020, 0, 1))
const WIDE_TO = new Date(Date.UTC(2030, 11, 31))

afterAll(async () => {
  await prisma.$disconnect()
})

describe('profit and loss', () => {
  it('sections add up to the net result computed independently in SQL', async () => {
    const report = await getProfitAndLoss(WIDE_FROM, WIDE_TO)
    expect(report.tiesOut).toBe(true)
    expect(report.netProfit).toBe(report.netProfitCheck)
  })

  it('gross profit is revenue less direct costs', async () => {
    const report = await getProfitAndLoss(WIDE_FROM, WIDE_TO)
    const expected = Number(report.revenue.total) - Number(report.directCosts.total)
    expect(Number(report.grossProfit)).toBeCloseTo(expected, 2)
  })

  it('operating profit deducts overheads from gross profit', async () => {
    const report = await getProfitAndLoss(WIDE_FROM, WIDE_TO)
    const expected = Number(report.grossProfit) - Number(report.operatingExpenses.total)
    expect(Number(report.operatingProfit)).toBeCloseTo(expected, 2)
  })
})

describe('balance sheet', () => {
  it('balances: assets equal liabilities plus equity', async () => {
    const year = await prisma.fiscalYear.findFirstOrThrow({ where: { code: '2627' } })
    const report = await getBalanceSheet(WIDE_TO, year.startDate)

    expect(report.balanced).toBe(true)
    expect(report.totalAssets).toBe(report.totalLiabilitiesAndEquity)
  })

  it('carries the unclosed result into equity', async () => {
    const year = await prisma.fiscalYear.findFirstOrThrow({ where: { code: '2627' } })
    const report = await getBalanceSheet(WIDE_TO, year.startDate)

    // Without current year earnings the statement could not balance mid-year,
    // because income and expense accounts are not closed until year end.
    const line = report.equity.rows.find((r) => r.name.includes('Current year earnings'))
    expect(line).toBeDefined()
    expect(line?.amount).toBe(report.currentYearEarnings)
  })
})

describe('cash flow', () => {
  it('opening plus movement equals the closing cash balance in the ledger', async () => {
    const report = await getCashFlow(WIDE_FROM, WIDE_TO)
    expect(report.tiesOut).toBe(true)
    expect(report.closing).toBe(report.closingCheck)
  })

  it('net movement is the sum of the three activity totals', async () => {
    const report = await getCashFlow(WIDE_FROM, WIDE_TO)
    const expected =
      Number(report.operatingTotal) +
      Number(report.investingTotal) +
      Number(report.financingTotal)
    expect(Number(report.netMovement)).toBeCloseTo(expected, 2)
  })
})

describe('day book', () => {
  it('lists every posted voucher in the range', async () => {
    const report = await getDayBook(WIDE_FROM, WIDE_TO)
    const count = await prisma.journalEntry.count({
      where: { status: { in: ['POSTED', 'REVERSED'] } },
    })
    expect(report.rows).toHaveLength(count)
  })

  it('is ordered by date', async () => {
    const report = await getDayBook(WIDE_FROM, WIDE_TO)
    const dates = report.rows.map((r) => r.entryDate)
    expect([...dates].sort()).toEqual(dates)
  })
})

describe('tax reports', () => {
  it('vat nets output against input', async () => {
    const report = await getVatSummary(WIDE_FROM, WIDE_TO)
    const expected = Number(report.outputVat) - Number(report.inputVat)
    expect(Number(report.netPayable)).toBeCloseTo(expected, 2)
  })

  it('withholding totals match the sum of their lines', async () => {
    const report = await getWithholding(WIDE_FROM, WIDE_TO)

    const sufferedLines = report.suffered.lines.reduce((s, l) => s + Number(l.amount), 0)
    const deductedLines = report.deducted.lines.reduce((s, l) => s + Number(l.amount), 0)

    expect(Number(report.suffered.total)).toBeCloseTo(sufferedLines, 2)
    expect(Number(report.deducted.total)).toBeCloseTo(deductedLines, 2)
  })

  it('keeps realised and unrealised fx apart', async () => {
    const report = await getFxGainLoss(WIDE_FROM, WIDE_TO)
    const accounts = new Set(report.lines.map((l) => l.account))
    for (const account of accounts) {
      expect(['Realised', 'Unrealised']).toContain(account)
    }
  })
})
