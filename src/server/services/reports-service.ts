import 'server-only'

import * as repo from '@/server/db/repositories/reports'
import { prisma } from '@/server/db/client'

/** Trial balance, general ledger, party ledger and control reconciliation. */

export type TrialBalanceResult = {
  rows: {
    code: string
    name: string
    type: string
    debit: string
    credit: string
    balanceDebit: string
    balanceCredit: string
  }[]
  totalDebit: string
  totalCredit: string
  difference: string
  balanced: boolean
}

export async function getTrialBalance(asOf: Date): Promise<TrialBalanceResult> {
  const raw = await repo.trialBalance(asOf)

  const rows = raw.map((row) => {
    const debit = Number(row.debit)
    const credit = Number(row.credit)
    const net = debit - credit
    return {
      code: row.code,
      name: row.name,
      type: row.type,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      // A net balance belongs on one side only — that is what makes the two
      // columns foot to the same number.
      balanceDebit: net > 0 ? net.toFixed(2) : '0.00',
      balanceCredit: net < 0 ? Math.abs(net).toFixed(2) : '0.00',
    }
  })

  const totalDebit = rows.reduce((s, r) => s + Number(r.balanceDebit), 0)
  const totalCredit = rows.reduce((s, r) => s + Number(r.balanceCredit), 0)
  const difference = totalDebit - totalCredit

  return {
    rows,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
    difference: difference.toFixed(2),
    balanced: Math.abs(difference) < 0.005,
  }
}

export type LedgerResult = {
  opening: string
  closing: string
  rows: {
    entryId: string
    voucherNo: string
    voucherType: string
    date: string
    narration: string
    partyName: string | null
    debit: string
    credit: string
    running: string
  }[]
  totalDebit: string
  totalCredit: string
}

function withRunningBalance(
  opening: string,
  raw: repo.LedgerRow[],
): LedgerResult {
  let running = Number(opening)
  let totalDebit = 0
  let totalCredit = 0

  const rows = raw.map((row) => {
    const debit = Number(row.debit)
    const credit = Number(row.credit)
    running += debit - credit
    totalDebit += debit
    totalCredit += credit

    return {
      entryId: row.entryId,
      voucherNo: row.voucherNo,
      voucherType: row.voucherType,
      date: new Date(row.entryDate).toISOString().slice(0, 10),
      narration: row.lineNarration ?? row.narration,
      partyName: row.partyName,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      running: running.toFixed(2),
    }
  })

  return {
    opening: Number(opening).toFixed(2),
    closing: running.toFixed(2),
    rows,
    totalDebit: totalDebit.toFixed(2),
    totalCredit: totalCredit.toFixed(2),
  }
}

export async function getGeneralLedger(accountCode: string, from: Date, to: Date) {
  const [opening, raw] = await Promise.all([
    repo.openingBalance(accountCode, from),
    repo.generalLedger(accountCode, from, to),
  ])
  return withRunningBalance(opening, raw)
}

export async function getPartyLedger(partyId: string, from: Date, to: Date) {
  const [opening, raw] = await Promise.all([
    repo.partyOpeningBalance(partyId, from),
    repo.partyLedger(partyId, from, to),
  ])
  return withRunningBalance(opening, raw)
}

export async function listParties() {
  return prisma.party.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, type: true },
  })
}

export async function getControlReconciliation() {
  const rows = await repo.controlAccountReconciliation()
  return rows.map((row) => {
    const control = Number(row.controlBalance)
    const party = Number(row.partyBalance)
    return {
      code: row.code,
      name: row.name,
      controlBalance: control.toFixed(2),
      partyBalance: party.toFixed(2),
      difference: (control - party).toFixed(2),
      reconciled: Math.abs(control - party) < 0.005,
    }
  })
}
