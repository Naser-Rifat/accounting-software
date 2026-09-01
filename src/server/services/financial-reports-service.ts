import 'server-only'

import { ACCOUNTS } from '@/server/accounting/accounts'
import * as repo from '@/server/db/repositories/financial-reports'

/**
 * Statutory and tax reports — docs/modules/11-reports.md.
 *
 * Each report carries its own integrity assertion. A balance sheet that does not
 * balance, or a P&L that does not tie to it, is a defect to surface loudly, not
 * a rounding difference to hide.
 */

const CASH_CODES = [ACCOUNTS.CASH_IN_HAND, ACCOUNTS.BANK]

type Section = {
  title: string
  rows: { code: string; name: string; amount: string; isContra: boolean }[]
  total: string
}

function section(
  title: string,
  rows: repo.AccountMovementRow[],
  direction: 'DEBIT' | 'CREDIT',
): Section {
  const mapped = rows.map((row) => {
    const debit = Number(row.debit)
    const credit = Number(row.credit)
    // Each account is netted in its own normal direction, so a contra account
    // (refunds, accumulated depreciation) shows as a positive deduction rather
    // than a confusing negative.
    const amount = direction === 'DEBIT' ? debit - credit : credit - debit
    return { code: row.code, name: row.name, amount, isContra: row.isContra }
  })

  return {
    title,
    rows: mapped.map((r) => ({ ...r, amount: r.amount.toFixed(2) })),
    total: mapped.reduce((sum, r) => sum + r.amount, 0).toFixed(2),
  }
}

// ---------------------------------------------------------------------------
// Profit & Loss
// ---------------------------------------------------------------------------

export type ProfitAndLossResult = {
  from: string
  to: string
  revenue: Section
  directCosts: Section
  grossProfit: string
  operatingExpenses: Section
  operatingProfit: string
  otherAndTax: Section
  netProfit: string
  /** The same figure computed independently in SQL — the two must agree. */
  netProfitCheck: string
  tiesOut: boolean
}

export async function getProfitAndLoss(from: Date, to: Date): Promise<ProfitAndLossResult> {
  const [rows, check] = await Promise.all([
    repo.incomeAndExpense(from, to),
    repo.netProfit(from, to),
  ])

  const inRange = (row: repo.AccountMovementRow, low: number, high: number) => {
    const code = Number(row.code)
    return code >= low && code <= high
  }

  const revenue = section(
    'Revenue',
    rows.filter((r) => inRange(r, 4000, 4999)),
    'CREDIT',
  )
  const directCosts = section(
    'Direct costs',
    rows.filter((r) => inRange(r, 5000, 5999)),
    'DEBIT',
  )
  const operatingExpenses = section(
    'Operating expenses',
    rows.filter((r) => inRange(r, 6000, 6999)),
    'DEBIT',
  )
  // 7xxx holds both other income and other expense; 8xxx is tax. Netted in the
  // debit direction so a gain reduces the charge.
  const otherAndTax = section(
    'Other income, expense and tax',
    rows.filter((r) => inRange(r, 7000, 8999)),
    'DEBIT',
  )

  const grossProfit = Number(revenue.total) - Number(directCosts.total)
  const operatingProfit = grossProfit - Number(operatingExpenses.total)
  const netProfit = operatingProfit - Number(otherAndTax.total)

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    revenue,
    directCosts,
    grossProfit: grossProfit.toFixed(2),
    operatingExpenses,
    operatingProfit: operatingProfit.toFixed(2),
    otherAndTax,
    netProfit: netProfit.toFixed(2),
    netProfitCheck: Number(check).toFixed(2),
    tiesOut: Math.abs(netProfit - Number(check)) < 0.005,
  }
}

// ---------------------------------------------------------------------------
// Balance Sheet
// ---------------------------------------------------------------------------

export type BalanceSheetResult = {
  asOf: string
  assets: Section
  liabilities: Section
  equity: Section
  /** Profit not yet closed to retained earnings, shown within equity. */
  currentYearEarnings: string
  totalAssets: string
  totalLiabilitiesAndEquity: string
  difference: string
  balanced: boolean
}

export async function getBalanceSheet(
  asOf: Date,
  fiscalYearStart: Date,
): Promise<BalanceSheetResult> {
  const [rows, profitThisYear, profitBefore] = await Promise.all([
    repo.balanceSheetAccounts(asOf),
    repo.netProfit(fiscalYearStart, asOf),
    repo.netProfitBefore(fiscalYearStart),
  ])

  const assets = section(
    'Assets',
    rows.filter((r) => r.type === 'ASSET'),
    'DEBIT',
  )
  const liabilities = section(
    'Liabilities',
    rows.filter((r) => r.type === 'LIABILITY'),
    'CREDIT',
  )
  const equityRows = section(
    'Equity',
    rows.filter((r) => r.type === 'EQUITY'),
    'CREDIT',
  )

  // Income and expense accounts are not closed until year end, so their net
  // result has to be brought onto the balance sheet explicitly. Without this
  // the statement cannot balance mid-year.
  const currentYearEarnings = Number(profitThisYear)
  const retainedFromPriorYears = Number(profitBefore)

  const equity: Section = {
    title: 'Equity',
    rows: [
      ...equityRows.rows,
      ...(retainedFromPriorYears !== 0
        ? [
            {
              code: '—',
              name: 'Retained result, prior periods',
              amount: retainedFromPriorYears.toFixed(2),
              isContra: false,
            },
          ]
        : []),
      {
        code: ACCOUNTS.CURRENT_YEAR_EARNINGS,
        name: 'Current year earnings (not yet closed)',
        amount: currentYearEarnings.toFixed(2),
        isContra: false,
      },
    ],
    total: (
      Number(equityRows.total) +
      retainedFromPriorYears +
      currentYearEarnings
    ).toFixed(2),
  }

  const totalAssets = Number(assets.total)
  const totalLiabilitiesAndEquity = Number(liabilities.total) + Number(equity.total)
  const difference = totalAssets - totalLiabilitiesAndEquity

  return {
    asOf: asOf.toISOString().slice(0, 10),
    assets,
    liabilities,
    equity,
    currentYearEarnings: currentYearEarnings.toFixed(2),
    totalAssets: totalAssets.toFixed(2),
    totalLiabilitiesAndEquity: totalLiabilitiesAndEquity.toFixed(2),
    difference: difference.toFixed(2),
    balanced: Math.abs(difference) < 0.005,
  }
}

// ---------------------------------------------------------------------------
// Cash Flow
// ---------------------------------------------------------------------------

export type CashFlowResult = {
  from: string
  to: string
  opening: string
  operating: { name: string; amount: string }[]
  investing: { name: string; amount: string }[]
  financing: { name: string; amount: string }[]
  operatingTotal: string
  investingTotal: string
  financingTotal: string
  netMovement: string
  closing: string
  /** Opening + movement must equal the closing balance in the ledger. */
  closingCheck: string
  tiesOut: boolean
}

/** Classify by the account the cash was posted against. */
function classify(contraCode: string, contraType: string): 'OPERATING' | 'INVESTING' | 'FINANCING' {
  const code = Number(contraCode)
  // Fixed assets bought or sold.
  if (code >= 1500 && code <= 1599) return 'INVESTING'
  // Owner capital, drawings and loans.
  if ((code >= 3000 && code <= 3999) || (code >= 2500 && code <= 2599)) return 'FINANCING'
  if (contraType === 'EQUITY') return 'FINANCING'
  return 'OPERATING'
}

export async function getCashFlow(from: Date, to: Date): Promise<CashFlowResult> {
  const dayBefore = new Date(from)
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)

  const [movements, opening, closing] = await Promise.all([
    repo.cashMovements(from, to, CASH_CODES),
    repo.cashBalanceAsOf(dayBefore, CASH_CODES),
    repo.cashBalanceAsOf(to, CASH_CODES),
  ])

  const buckets = {
    OPERATING: new Map<string, number>(),
    INVESTING: new Map<string, number>(),
    FINANCING: new Map<string, number>(),
  }

  for (const row of movements) {
    const bucket = buckets[classify(row.contraCode, row.contraType)]
    // Rows are the contra side, so the sign is inverted: a credit there means
    // cash came in, a debit means cash went out.
    const net = Number(row.credit) - Number(row.debit)
    const label = `${row.contraCode} ${row.contraName}`
    bucket.set(label, (bucket.get(label) ?? 0) + net)
  }

  const toRows = (map: Map<string, number>) =>
    [...map]
      .filter(([, amount]) => Math.abs(amount) >= 0.005)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, amount]) => ({ name, amount: amount.toFixed(2) }))

  const total = (map: Map<string, number>) =>
    [...map.values()].reduce((sum, amount) => sum + amount, 0)

  const operatingTotal = total(buckets.OPERATING)
  const investingTotal = total(buckets.INVESTING)
  const financingTotal = total(buckets.FINANCING)
  const netMovement = operatingTotal + investingTotal + financingTotal
  const computedClosing = Number(opening) + netMovement

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    opening: Number(opening).toFixed(2),
    operating: toRows(buckets.OPERATING),
    investing: toRows(buckets.INVESTING),
    financing: toRows(buckets.FINANCING),
    operatingTotal: operatingTotal.toFixed(2),
    investingTotal: investingTotal.toFixed(2),
    financingTotal: financingTotal.toFixed(2),
    netMovement: netMovement.toFixed(2),
    closing: computedClosing.toFixed(2),
    closingCheck: Number(closing).toFixed(2),
    tiesOut: Math.abs(computedClosing - Number(closing)) < 0.005,
  }
}

// ---------------------------------------------------------------------------
// Day Book
// ---------------------------------------------------------------------------

export async function getDayBook(from: Date, to: Date) {
  const rows = await repo.dayBook(from, to)

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    rows: rows.map((row) => ({
      entryId: row.entryId,
      voucherType: row.voucherType,
      voucherNo: row.voucherNo,
      entryDate: row.entryDate.toISOString().slice(0, 10),
      narration: row.narration,
      status: row.status,
      createdBy: row.createdBy,
      amount: Number(row.amount).toFixed(2),
    })),
    total: rows.reduce((sum, r) => sum + Number(r.amount), 0).toFixed(2),
  }
}

// ---------------------------------------------------------------------------
// Tax reports
// ---------------------------------------------------------------------------

export type VatSummaryResult = {
  from: string
  to: string
  outputVat: string
  inputVat: string
  netPayable: string
  /** Positive means owed to the authority; negative is reclaimable. */
  direction: 'PAYABLE' | 'RECLAIMABLE' | 'NIL'
  outputLines: { date: string; voucherNo: string; narration: string; amount: string }[]
  inputLines: { date: string; voucherNo: string; narration: string; amount: string }[]
}

export async function getVatSummary(from: Date, to: Date): Promise<VatSummaryResult> {
  const [output, input] = await Promise.all([
    repo.taxAccountMovements(ACCOUNTS.VAT_PAYABLE, from, to),
    repo.taxAccountMovements(ACCOUNTS.INPUT_VAT, from, to),
  ])

  // Output VAT is a liability: credits increase it. Input VAT is an asset.
  const outputVat = output.reduce((s, r) => s + Number(r.credit) - Number(r.debit), 0)
  const inputVat = input.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)
  const net = outputVat - inputVat

  const line = (r: repo.TaxLineRow, amount: number) => ({
    date: r.entryDate.toISOString().slice(0, 10),
    voucherNo: r.voucherNo,
    narration: r.partyName ? `${r.partyName} — ${r.narration}` : r.narration,
    amount: amount.toFixed(2),
  })

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    outputVat: outputVat.toFixed(2),
    inputVat: inputVat.toFixed(2),
    netPayable: net.toFixed(2),
    direction: Math.abs(net) < 0.005 ? 'NIL' : net > 0 ? 'PAYABLE' : 'RECLAIMABLE',
    outputLines: output.map((r) => line(r, Number(r.credit) - Number(r.debit))),
    inputLines: input.map((r) => line(r, Number(r.debit) - Number(r.credit))),
  }
}

export type WithholdingResult = {
  from: string
  to: string
  suffered: {
    total: string
    byParty: { party: string; amount: string }[]
    lines: { date: string; voucherNo: string; party: string; narration: string; amount: string }[]
  }
  deducted: {
    total: string
    byParty: { party: string; amount: string }[]
    lines: { date: string; voucherNo: string; party: string; narration: string; amount: string }[]
  }
}

export async function getWithholding(from: Date, to: Date): Promise<WithholdingResult> {
  const [suffered, deducted] = await Promise.all([
    // 1310 is an asset: tax deducted from money owed to us, reclaimable.
    repo.taxAccountMovements(ACCOUNTS.WITHHOLDING_TAX_RECEIVABLE, from, to),
    // 2320 is a liability: tax we deducted from others, owed to the authority.
    repo.taxAccountMovements(ACCOUNTS.WITHHOLDING_TAX_PAYABLE, from, to),
  ])

  const build = (rows: repo.TaxLineRow[], direction: 'DEBIT' | 'CREDIT') => {
    const byParty = new Map<string, number>()
    const lines = rows.map((r) => {
      const amount =
        direction === 'DEBIT'
          ? Number(r.debit) - Number(r.credit)
          : Number(r.credit) - Number(r.debit)
      const party = r.partyName ?? 'Unattributed'
      byParty.set(party, (byParty.get(party) ?? 0) + amount)
      return {
        date: r.entryDate.toISOString().slice(0, 10),
        voucherNo: r.voucherNo,
        party,
        narration: r.narration,
        amount: amount.toFixed(2),
      }
    })

    return {
      total: lines.reduce((s, l) => s + Number(l.amount), 0).toFixed(2),
      byParty: [...byParty]
        .sort((a, b) => b[1] - a[1])
        .map(([party, amount]) => ({ party, amount: amount.toFixed(2) })),
      lines,
    }
  }

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    suffered: build(suffered, 'DEBIT'),
    deducted: build(deducted, 'CREDIT'),
  }
}

export type FxResult = {
  from: string
  to: string
  realised: { net: string; isGain: boolean }
  unrealised: { net: string; isGain: boolean }
  lines: {
    account: string
    date: string
    voucherNo: string
    narration: string
    amount: string
  }[]
}

export async function getFxGainLoss(from: Date, to: Date): Promise<FxResult> {
  const [realised, unrealised] = await Promise.all([
    repo.taxAccountMovements(ACCOUNTS.FX_REALISED, from, to),
    repo.taxAccountMovements(ACCOUNTS.FX_UNREALISED, from, to),
  ])

  // Both are expense-natured accounts: a debit is a loss, a credit a gain.
  const net = (rows: repo.TaxLineRow[]) =>
    rows.reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0)

  const realisedNet = net(realised)
  const unrealisedNet = net(unrealised)

  const toLines = (rows: repo.TaxLineRow[], account: string) =>
    rows.map((r) => ({
      account,
      date: r.entryDate.toISOString().slice(0, 10),
      voucherNo: r.voucherNo,
      narration: r.narration,
      amount: (Number(r.debit) - Number(r.credit)).toFixed(2),
    }))

  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    realised: { net: Math.abs(realisedNet).toFixed(2), isGain: realisedNet < 0 },
    unrealised: { net: Math.abs(unrealisedNet).toFixed(2), isGain: unrealisedNet < 0 },
    lines: [...toLines(realised, 'Realised'), ...toLines(unrealised, 'Unrealised')].sort(
      (a, b) => a.date.localeCompare(b.date),
    ),
  }
}
