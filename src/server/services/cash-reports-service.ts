import 'server-only'

import { ACCOUNTS } from '@/server/accounting/accounts'
import * as cashRepo from '@/server/db/repositories/cash-reports'
import * as repo from '@/server/db/repositories/financial-reports'

/**
 * Cash & Bank Book and Receipts & Payments — docs/modules/11-reports.md.
 *
 * Both are *cash-basis views* over an accrual ledger, which rule 2 allows: the
 * storage model stays accrual, and only the presentation is cash. Neither
 * report recomputes anything from source tables; every figure comes from
 * JournalLine, so they cannot drift from the trial balance.
 */

export type BookType = 'ALL' | 'CASH' | 'BANK'

function iso(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dayBefore(date: Date) {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() - 1)
  return d
}

// ---------------------------------------------------------------------------
// Cash & Bank Book
// ---------------------------------------------------------------------------

export type CashBookEntry = {
  entryId: string
  voucherNo: string
  voucherType: string
  date: string
  narration: string
  status: string
  /** Money into the account. */
  receipt: string
  /** Money out of the account. */
  payment: string
  /** Running balance after this line. */
  balance: string
}

export type CashBookAccount = {
  code: string
  name: string
  book: string
  opening: string
  receipts: string
  payments: string
  closing: string
  rows: CashBookEntry[]
}

export type CashBookResult = {
  from: string
  to: string
  book: BookType
  accounts: CashBookAccount[]
  totalOpening: string
  totalReceipts: string
  totalPayments: string
  totalClosing: string
}

/**
 * A per-account fund ledger with balance brought forward and a running balance.
 *
 * An account with no movement in the period is still listed when it carries a
 * balance — a cash book that hides a funded account is worse than a long one.
 */
export async function getCashAndBankBook(
  from: Date,
  to: Date,
  book: BookType = 'ALL',
): Promise<CashBookResult> {
  const all = await cashRepo.fundAccounts(ACCOUNTS.CASH_IN_HAND, ACCOUNTS.BANK)
  const accounts = book === 'ALL' ? all : all.filter((a) => a.book === book)
  const codes = accounts.map((a) => a.code)

  const [movements, openings] = await Promise.all([
    cashRepo.fundLedger(codes, from, to),
    cashRepo.fundOpeningBalances(codes, from),
  ])

  const openingByCode = new Map(openings.map((o) => [o.accountCode, Number(o.balance)]))
  const movementsByCode = new Map<string, cashRepo.FundLedgerRow[]>()
  for (const row of movements) {
    const list = movementsByCode.get(row.accountCode)
    if (list) list.push(row)
    else movementsByCode.set(row.accountCode, [row])
  }

  const built: CashBookAccount[] = accounts.map((account) => {
    const opening = openingByCode.get(account.code) ?? 0
    const rows = movementsByCode.get(account.code) ?? []

    let running = opening
    let receipts = 0
    let payments = 0

    const mapped = rows.map((row) => {
      const receipt = Number(row.debit)
      const payment = Number(row.credit)
      receipts += receipt
      payments += payment
      running += receipt - payment
      return {
        entryId: row.entryId,
        voucherNo: row.voucherNo,
        voucherType: row.voucherType,
        date: iso(row.entryDate),
        narration: row.lineNarration ?? row.narration,
        status: row.status,
        receipt: receipt.toFixed(2),
        payment: payment.toFixed(2),
        balance: running.toFixed(2),
      }
    })

    return {
      code: account.code,
      name: account.name,
      book: account.book,
      opening: opening.toFixed(2),
      receipts: receipts.toFixed(2),
      payments: payments.toFixed(2),
      closing: running.toFixed(2),
      rows: mapped,
    }
  })

  // Drop accounts that neither hold money nor moved — otherwise every unused
  // sub-account pads the report.
  const visible = built.filter(
    (a) => a.rows.length > 0 || Math.abs(Number(a.opening)) >= 0.005,
  )

  const sum = (pick: (a: CashBookAccount) => string) =>
    visible.reduce((total, a) => total + Number(pick(a)), 0).toFixed(2)

  return {
    from: iso(from),
    to: iso(to),
    book,
    accounts: visible,
    totalOpening: sum((a) => a.opening),
    totalReceipts: sum((a) => a.receipts),
    totalPayments: sum((a) => a.payments),
    totalClosing: sum((a) => a.closing),
  }
}

// ---------------------------------------------------------------------------
// Receipts & Payments account
// ---------------------------------------------------------------------------

export type ReceiptsPaymentsResult = {
  from: string
  to: string
  opening: string
  receipts: { name: string; amount: string }[]
  payments: { name: string; amount: string }[]
  totalReceipts: string
  totalPayments: string
  closing: string
  /** Closing computed independently from balances — the two must agree. */
  closingCheck: string
  tiesOut: boolean
}

/**
 * The classic two-sided cash statement: opening balance plus everything
 * received on the left, everything paid plus the closing balance on the right,
 * and the two sides equal.
 *
 * Grouped by the *contra* account, which is what makes a transfer between two
 * of your own bank accounts drop out: such a voucher has no non-fund line, so
 * it contributes nothing. Money moving between your own pockets was never a
 * receipt or a payment.
 */
export async function getReceiptsAndPayments(
  from: Date,
  to: Date,
): Promise<ReceiptsPaymentsResult> {
  const accounts = await cashRepo.fundAccounts(ACCOUNTS.CASH_IN_HAND, ACCOUNTS.BANK)
  const codes = accounts.map((a) => a.code)

  const [movements, opening, closing] = await Promise.all([
    repo.cashMovements(from, to, codes),
    repo.cashBalanceAsOf(dayBefore(from), codes),
    repo.cashBalanceAsOf(to, codes),
  ])

  const receipts: { name: string; amount: number }[] = []
  const payments: { name: string; amount: number }[] = []

  for (const row of movements) {
    // Rows are the contra side, so the sign inverts: a credit there means cash
    // came in, a debit means cash went out.
    const net = Number(row.credit) - Number(row.debit)
    if (Math.abs(net) < 0.005) continue
    const label = `${row.contraCode} ${row.contraName}`
    if (net > 0) receipts.push({ name: label, amount: net })
    else payments.push({ name: label, amount: -net })
  }

  const total = (rows: { amount: number }[]) =>
    rows.reduce((sum, r) => sum + r.amount, 0)

  const totalReceipts = total(receipts)
  const totalPayments = total(payments)
  const computedClosing = Number(opening) + totalReceipts - totalPayments

  const format = (rows: { name: string; amount: number }[]) =>
    rows
      .sort((a, b) => b.amount - a.amount)
      .map((r) => ({ name: r.name, amount: r.amount.toFixed(2) }))

  return {
    from: iso(from),
    to: iso(to),
    opening: Number(opening).toFixed(2),
    receipts: format(receipts),
    payments: format(payments),
    totalReceipts: totalReceipts.toFixed(2),
    totalPayments: totalPayments.toFixed(2),
    closing: computedClosing.toFixed(2),
    closingCheck: Number(closing).toFixed(2),
    tiesOut: Math.abs(computedClosing - Number(closing)) < 0.005,
  }
}
