import { NextResponse } from 'next/server'

import { getCurrentUser } from '@/server/auth/session'
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
 * CSV export for the statutory and tax reports.
 *
 * A route handler rather than a Server Action because this returns a file
 * download, which actions cannot do. Same services as the screens, so an export
 * can never disagree with what was on screen.
 */

type Row = (string | number)[]

/** RFC 4180 quoting: wrap in quotes and double any quote inside. */
function toCsv(rows: Row[]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = String(cell ?? '')
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
        })
        .join(','),
    )
    .join('\r\n')
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ report: string }> },
) {
  // Exports are as sensitive as the screens — same authentication.
  const user = await getCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  }

  const { report } = await params
  const url = new URL(request.url)
  const today = new Date()
  const fromStr =
    url.searchParams.get('from') ??
    new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10)
  const toStr = url.searchParams.get('to') ?? today.toISOString().slice(0, 10)

  const from = new Date(`${fromStr}T00:00:00.000Z`)
  const to = new Date(`${toStr}T00:00:00.000Z`)

  let rows: Row[]
  let filename: string

  switch (report) {
    case 'profit-loss': {
      const data = await getProfitAndLoss(from, to)
      rows = [
        ['Profit & Loss', `${data.from} to ${data.to}`],
        [],
        ['Section', 'Code', 'Account', 'Amount'],
        ...data.revenue.rows.map((r): Row => ['Revenue', r.code, r.name, r.amount]),
        ['', '', 'Total revenue', data.revenue.total],
        ...data.directCosts.rows.map((r): Row => ['Direct costs', r.code, r.name, r.amount]),
        ['', '', 'Total direct costs', data.directCosts.total],
        ['', '', 'Gross profit', data.grossProfit],
        ...data.operatingExpenses.rows.map(
          (r): Row => ['Operating expenses', r.code, r.name, r.amount],
        ),
        ['', '', 'Total operating expenses', data.operatingExpenses.total],
        ['', '', 'Operating profit', data.operatingProfit],
        ...data.otherAndTax.rows.map((r): Row => ['Other and tax', r.code, r.name, r.amount]),
        ['', '', 'Net profit', data.netProfit],
      ]
      filename = `profit-loss-${data.from}-to-${data.to}.csv`
      break
    }

    case 'balance-sheet': {
      const period = await prisma.accountingPeriod.findFirst({
        where: { startDate: { lte: to }, endDate: { gte: to } },
        include: { fiscalYear: true },
      })
      const fyStart =
        period?.fiscalYear.startDate ?? new Date(Date.UTC(to.getUTCFullYear(), 0, 1))
      const data = await getBalanceSheet(to, fyStart)

      rows = [
        ['Balance Sheet', `As at ${data.asOf}`],
        [],
        ['Section', 'Code', 'Account', 'Amount'],
        ...data.assets.rows.map((r): Row => ['Assets', r.code, r.name, r.amount]),
        ['', '', 'Total assets', data.assets.total],
        ...data.liabilities.rows.map((r): Row => ['Liabilities', r.code, r.name, r.amount]),
        ['', '', 'Total liabilities', data.liabilities.total],
        ...data.equity.rows.map((r): Row => ['Equity', r.code, r.name, r.amount]),
        ['', '', 'Total equity', data.equity.total],
        ['', '', 'Total liabilities and equity', data.totalLiabilitiesAndEquity],
        ['', '', 'Balanced', data.balanced ? 'yes' : `NO — difference ${data.difference}`],
      ]
      filename = `balance-sheet-${data.asOf}.csv`
      break
    }

    case 'cash-flow': {
      const data = await getCashFlow(from, to)
      rows = [
        ['Cash Flow', `${data.from} to ${data.to}`],
        [],
        ['Section', 'Item', 'Amount'],
        ['', 'Cash and bank at start', data.opening],
        ...data.operating.map((r): Row => ['Operating', r.name, r.amount]),
        ['', 'Net from operating', data.operatingTotal],
        ...data.investing.map((r): Row => ['Investing', r.name, r.amount]),
        ['', 'Net from investing', data.investingTotal],
        ...data.financing.map((r): Row => ['Financing', r.name, r.amount]),
        ['', 'Net from financing', data.financingTotal],
        ['', 'Net movement', data.netMovement],
        ['', 'Cash and bank at end', data.closing],
      ]
      filename = `cash-flow-${data.from}-to-${data.to}.csv`
      break
    }

    case 'day-book': {
      const data = await getDayBook(from, to)
      rows = [
        ['Day Book', `${data.from} to ${data.to}`],
        [],
        ['Date', 'Type', 'Voucher', 'Narration', 'Status', 'By', 'Amount'],
        ...data.rows.map(
          (r): Row => [
            r.entryDate,
            r.voucherType,
            r.voucherNo,
            r.narration,
            r.status,
            r.createdBy,
            r.amount,
          ],
        ),
        ['', '', '', '', '', 'Total', data.total],
      ]
      filename = `day-book-${data.from}-to-${data.to}.csv`
      break
    }

    case 'vat': {
      const data = await getVatSummary(from, to)
      rows = [
        ['VAT Summary', `${data.from} to ${data.to}`],
        [],
        ['Output VAT', data.outputVat],
        ['Input VAT', data.inputVat],
        ['Net', data.netPayable, data.direction],
        [],
        ['Type', 'Date', 'Voucher', 'Narration', 'Amount'],
        ...data.outputLines.map(
          (r): Row => ['Output', r.date, r.voucherNo, r.narration, r.amount],
        ),
        ...data.inputLines.map((r): Row => ['Input', r.date, r.voucherNo, r.narration, r.amount]),
      ]
      filename = `vat-${data.from}-to-${data.to}.csv`
      break
    }

    case 'withholding': {
      const data = await getWithholding(from, to)
      rows = [
        ['Withholding Tax', `${data.from} to ${data.to}`],
        [],
        ['Suffered total', data.suffered.total],
        ['Deducted total', data.deducted.total],
        [],
        ['Direction', 'Date', 'Voucher', 'Party', 'Narration', 'Amount'],
        ...data.suffered.lines.map(
          (r): Row => ['Suffered', r.date, r.voucherNo, r.party, r.narration, r.amount],
        ),
        ...data.deducted.lines.map(
          (r): Row => ['Deducted', r.date, r.voucherNo, r.party, r.narration, r.amount],
        ),
      ]
      filename = `withholding-${data.from}-to-${data.to}.csv`
      break
    }

    case 'fx': {
      const data = await getFxGainLoss(from, to)
      rows = [
        ['FX Gain / Loss', `${data.from} to ${data.to}`],
        [],
        ['Realised', data.realised.net, data.realised.isGain ? 'gain' : 'loss'],
        ['Unrealised', data.unrealised.net, data.unrealised.isGain ? 'gain' : 'loss'],
        [],
        ['Type', 'Date', 'Voucher', 'Narration', 'Loss/(gain)'],
        ...data.lines.map((r): Row => [r.account, r.date, r.voucherNo, r.narration, r.amount]),
      ]
      filename = `fx-${data.from}-to-${data.to}.csv`
      break
    }

    default:
      return NextResponse.json({ error: `Unknown report "${report}"` }, { status: 404 })
  }

  // BOM so Excel opens UTF-8 correctly rather than mangling any non-ASCII text.
  return new NextResponse(`﻿${toCsv(rows)}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
