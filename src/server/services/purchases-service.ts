import 'server-only'

import { Prisma } from '@/generated/prisma/client'
import type { BillStatus, PaymentMethod } from '@/generated/prisma/enums'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { allocateNumber } from '@/server/accounting/numbering'
import { resolvePeriod } from '@/server/accounting/period'
import { postEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'
import { allocatePartyCode } from '@/server/services/party-service'

/**
 * Purchases & payments — docs/modules/07-expenses.md.
 *
 * Accrual basis: a bill hits the ledger when it is APPROVED, not when it is
 * paid, because the expense belongs to the period it was incurred in. Payment
 * only settles the liability.
 *
 * Vendors are Parties, so every 2010 line carries one. That is what lets the AP
 * control account reconcile to the vendor subledger.
 */

const ZERO = new Prisma.Decimal(0)

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------

export async function listVendors() {
  const vendors = await prisma.party.findMany({
    where: { type: 'VENDOR' },
    orderBy: { name: 'asc' },
  })

  // Outstanding is derived from the ledger, never stored on the vendor.
  const balances = await prisma.$queryRaw<{ partyId: string; balance: string }[]>`
    SELECT l."partyId", (SUM(l."credit") - SUM(l."debit"))::text AS balance
      FROM "JournalLine" l
      JOIN "Account" a      ON a."id" = l."accountId"
      JOIN "JournalEntry" e ON e."id" = l."entryId"
     WHERE a."code" = ${ACCOUNTS.AP_VENDORS}
       AND e."status" IN ('POSTED', 'REVERSED')
       AND l."partyId" IS NOT NULL
     GROUP BY l."partyId"
  `
  const byParty = new Map(balances.map((b) => [b.partyId, b.balance]))

  return vendors.map((vendor) => ({
    id: vendor.id,
    code: vendor.code,
    name: vendor.name,
    currency: vendor.currency,
    isActive: vendor.isActive,
    outstanding: Number(byParty.get(vendor.id) ?? 0).toFixed(2),
  }))
}

export async function createVendor(input: { name: string; code?: string; createdBy: string }) {
  const name = input.name.trim()
  if (!name) throw new AccountingError('INVALID_LINE', 'Vendor name is required.')

  return prisma.$transaction(async (tx) => {
    const code = await allocatePartyCode(tx, name, input.code, 'VENDOR')
    return tx.party.create({
      data: {
        code,
        name,
        type: 'VENDOR',
        controlAccountCode: ACCOUNTS.AP_VENDORS,
        currency: 'BDT',
      },
    })
  })
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

export async function listCategories() {
  return prisma.expenseCategory.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
  })
}

/** Amount already settled against a bill, from allocations and debit notes. */
async function settledByBill(): Promise<Map<string, Prisma.Decimal>> {
  const [allocations, notes] = await Promise.all([
    prisma.paymentAllocation.groupBy({ by: ['billId'], _sum: { amount: true } }),
    prisma.debitNote.groupBy({ by: ['billId'], _sum: { amount: true } }),
  ])

  const map = new Map<string, Prisma.Decimal>()
  for (const row of allocations) {
    map.set(row.billId, new Prisma.Decimal(row._sum.amount ?? 0))
  }
  for (const row of notes) {
    if (!row.billId) continue
    map.set(
      row.billId,
      (map.get(row.billId) ?? ZERO).add(new Prisma.Decimal(row._sum.amount ?? 0)),
    )
  }
  return map
}

export async function listBills(filter?: { status?: BillStatus; partyId?: string }) {
  const [bills, settled] = await Promise.all([
    prisma.expenseBill.findMany({
      where: {
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.partyId ? { partyId: filter.partyId } : {}),
      },
      orderBy: [{ incurredOn: 'desc' }, { billNo: 'desc' }],
      include: { party: true, category: true },
      take: 200,
    }),
    settledByBill(),
  ])

  const rows = bills.map((bill) => {
    const paid = settled.get(bill.id) ?? ZERO
    const outstanding = bill.total.sub(paid)
    return {
      id: bill.id,
      billNo: bill.billNo,
      vendor: bill.party.name,
      vendorId: bill.partyId,
      category: bill.category.name,
      incurredOn: bill.incurredOn.toISOString().slice(0, 10),
      dueOn: bill.dueOn?.toISOString().slice(0, 10) ?? null,
      description: bill.description,
      vendorRef: bill.vendorRef,
      amount: bill.amount.toFixed(2),
      taxAmount: bill.taxAmount.toFixed(2),
      total: bill.total.toFixed(2),
      paid: paid.toFixed(2),
      outstanding: outstanding.toFixed(2),
      status: bill.status,
      journalEntryId: bill.journalEntryId,
    }
  })

  return {
    rows,
    totals: {
      total: rows.reduce((s, r) => s + Number(r.total), 0).toFixed(2),
      outstanding: rows.reduce((s, r) => s + Number(r.outstanding), 0).toFixed(2),
    },
  }
}

export async function createBill(input: {
  partyId: string
  categoryId: string
  incurredOn: Date
  dueOn: Date | null
  amount: string
  taxAmount: string
  vendorRef: string | null
  description: string
  createdBy: string
}) {
  const amount = new Prisma.Decimal(input.amount || 0)
  const tax = new Prisma.Decimal(input.taxAmount || 0)

  if (amount.lte(ZERO)) {
    throw new AccountingError('INVALID_LINE', 'Bill amount must be greater than zero.')
  }
  if (tax.isNegative()) {
    throw new AccountingError('INVALID_LINE', 'Tax cannot be negative.')
  }
  if (!input.description.trim()) {
    throw new AccountingError('INVALID_LINE', 'A description is required.')
  }

  const [vendor, category] = await Promise.all([
    prisma.party.findUnique({ where: { id: input.partyId } }),
    prisma.expenseCategory.findUnique({ where: { id: input.categoryId } }),
  ])
  if (!vendor || vendor.type !== 'VENDOR') {
    throw new AccountingError('INVALID_LINE', 'Unknown vendor.')
  }
  if (!category) throw new AccountingError('INVALID_LINE', 'Unknown expense category.')

  return prisma.$transaction(async (tx) => {
    const period = await resolvePeriod(tx, input.incurredOn, { canPostToSoftClosed: true })
    const number = await allocateNumber(tx, 'EXP', period.fiscalYearId, period.fiscalYearCode)

    return tx.expenseBill.create({
      data: {
        billNo: number.formatted,
        partyId: input.partyId,
        categoryId: input.categoryId,
        incurredOn: input.incurredOn,
        dueOn: input.dueOn,
        amount: amount.toFixed(2),
        taxAmount: tax.toFixed(2),
        total: amount.add(tax).toFixed(2),
        vendorRef: input.vendorRef,
        description: input.description.trim(),
        createdBy: input.createdBy,
      },
    })
  })
}

/**
 * Approve a bill and post it — row 20 of the posting matrix.
 *
 *   Dr expense account (category mapping)
 *   Dr 1320 Input VAT           (only when tax was charged)
 *   Cr 2010 Accounts Payable    (carrying the vendor)
 */
export async function approveBill(input: {
  billId: string
  approvedBy: string
  canPostToSoftClosed: boolean
}) {
  const bill = await prisma.expenseBill.findUnique({
    where: { id: input.billId },
    include: { category: true, party: true },
  })
  if (!bill) throw new AccountingError('INVALID_LINE', 'Bill not found.')
  if (bill.status !== 'DRAFT') {
    throw new AccountingError(
      'ALREADY_POSTED',
      `${bill.billNo} is already ${bill.status.toLowerCase()}.`,
    )
  }

  return prisma.$transaction(async (tx) => {
    const voucher = await postEntry(tx, {
      voucherType: 'PB',
      entryDate: bill.incurredOn,
      narration: `${bill.party.name} — ${bill.description}`,
      sourceType: 'EXPENSE_BILL',
      sourceId: bill.id,
      currency: bill.currency,
      fxRate: bill.fxRate,
      createdBy: input.approvedBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        {
          accountCode: bill.category.glAccountCode,
          debit: bill.amount.toFixed(2),
          lineNarration: bill.vendorRef ?? undefined,
        },
        ...(bill.taxAmount.gt(ZERO)
          ? [{ accountCode: ACCOUNTS.INPUT_VAT, debit: bill.taxAmount.toFixed(2) }]
          : []),
        {
          accountCode: ACCOUNTS.AP_VENDORS,
          credit: bill.total.toFixed(2),
          partyId: bill.partyId,
        },
      ],
    })

    await tx.expenseBill.update({
      where: { id: bill.id },
      data: {
        status: 'APPROVED',
        approvedOn: new Date(),
        approvedBy: input.approvedBy,
        journalEntryId: voucher.id,
      },
    })

    return { voucherNo: voucher.voucherNo, total: bill.total.toFixed(2) }
  })
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

export async function listPayments() {
  const payments = await prisma.payment.findMany({
    orderBy: [{ paidOn: 'desc' }, { paymentNo: 'desc' }],
    include: { party: true, allocations: { include: { bill: true } } },
    take: 100,
  })

  return payments.map((payment) => ({
    id: payment.id,
    paymentNo: payment.paymentNo,
    vendor: payment.party.name,
    paidOn: payment.paidOn.toISOString().slice(0, 10),
    amount: payment.amount.toFixed(2),
    withheldTax: payment.withheldTax.toFixed(2),
    netPaid: payment.netPaid.toFixed(2),
    method: payment.method,
    reference: payment.reference,
    bills: payment.allocations.map((a) => a.bill.billNo).join(', '),
  }))
}

/** Bills a vendor still owes money on, oldest first. */
export async function listOpenBills(partyId: string) {
  const [bills, settled] = await Promise.all([
    prisma.expenseBill.findMany({
      where: { partyId, status: { in: ['APPROVED', 'PARTIALLY_PAID'] } },
      orderBy: { incurredOn: 'asc' },
    }),
    settledByBill(),
  ])

  return bills
    .map((bill) => {
      const paid = settled.get(bill.id) ?? ZERO
      return {
        id: bill.id,
        billNo: bill.billNo,
        incurredOn: bill.incurredOn.toISOString().slice(0, 10),
        dueOn: bill.dueOn?.toISOString().slice(0, 10) ?? null,
        total: bill.total.toFixed(2),
        outstanding: bill.total.sub(paid).toFixed(2),
      }
    })
    .filter((bill) => Number(bill.outstanding) > 0.005)
}

/**
 * Pay a vendor — rows 21 and 22.
 *
 *   Dr 2010 Accounts Payable (vendor)   gross settled
 *   Cr 1010/1020 cash or bank           net actually paid
 *   Cr 2320 Withholding Tax Payable     tax withheld, owed to the authority
 *
 * Allocation is oldest-first across the vendor's open bills, which is how a
 * payment on account is normally applied.
 */
export async function payVendor(input: {
  partyId: string
  paidOn: Date
  amount: string
  withheldTax: string
  bankAccountCode: string
  method: PaymentMethod
  reference: string | null
  createdBy: string
  canPostToSoftClosed: boolean
}) {
  const gross = new Prisma.Decimal(input.amount || 0)
  const withheld = new Prisma.Decimal(input.withheldTax || 0)

  if (gross.lte(ZERO)) {
    throw new AccountingError('INVALID_LINE', 'Payment must be greater than zero.')
  }
  if (withheld.isNegative() || withheld.gt(gross)) {
    throw new AccountingError(
      'INVALID_LINE',
      'Withheld tax must be between zero and the amount being settled.',
    )
  }

  const vendor = await prisma.party.findUnique({ where: { id: input.partyId } })
  if (!vendor || vendor.type !== 'VENDOR') {
    throw new AccountingError('INVALID_LINE', 'Unknown vendor.')
  }

  const open = await listOpenBills(input.partyId)
  const totalOpen = open.reduce((sum, b) => sum + Number(b.outstanding), 0)

  // Paying more than is owed would leave the vendor with a debit balance and no
  // bill to point at. Refuse rather than create an unexplained balance.
  if (gross.toNumber() > totalOpen + 0.005) {
    throw new AccountingError(
      'INVALID_LINE',
      `${vendor.name} has only ${totalOpen.toFixed(2)} outstanding; cannot settle ${gross.toFixed(2)}.`,
    )
  }

  const netPaid = gross.sub(withheld)

  return prisma.$transaction(async (tx) => {
    // The payment IS the payment voucher, so it takes the voucher's number.
    // Allocating a separate document number would draw from the same PV series
    // and burn two numbers per payment, leaving gaps — and gapless numbering is
    // what makes a missing document detectable (docs/03 rule 6).
    const voucher = await postEntry(tx, {
      voucherType: 'PV',
      entryDate: input.paidOn,
      narration: `Payment to ${vendor.name}${input.reference ? ` (${input.reference})` : ''}`,
      sourceType: 'PAYMENT',
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        {
          accountCode: ACCOUNTS.AP_VENDORS,
          debit: gross.toFixed(2),
          partyId: input.partyId,
        },
        { accountCode: input.bankAccountCode, credit: netPaid.toFixed(2) },
        ...(withheld.gt(ZERO)
          ? [
              {
                accountCode: ACCOUNTS.WITHHOLDING_TAX_PAYABLE,
                credit: withheld.toFixed(2),
              },
            ]
          : []),
      ],
    })

    const payment = await tx.payment.create({
      data: {
        paymentNo: voucher.voucherNo,
        partyId: input.partyId,
        paidOn: input.paidOn,
        amount: gross.toFixed(2),
        withheldTax: withheld.toFixed(2),
        netPaid: netPaid.toFixed(2),
        method: input.method,
        reference: input.reference,
        bankAccountCode: input.bankAccountCode,
        journalEntryId: voucher.id,
        createdBy: input.createdBy,
      },
    })

    // Allocate oldest first.
    let remaining = gross
    for (const bill of open) {
      if (remaining.lte(ZERO)) break
      const outstanding = new Prisma.Decimal(bill.outstanding)
      const applied = remaining.gt(outstanding) ? outstanding : remaining

      await tx.paymentAllocation.create({
        data: { paymentId: payment.id, billId: bill.id, amount: applied.toFixed(2) },
      })

      await tx.expenseBill.update({
        where: { id: bill.id },
        data: { status: applied.gte(outstanding) ? 'PAID' : 'PARTIALLY_PAID' },
      })

      remaining = remaining.sub(applied)
    }

    return {
      paymentNo: payment.paymentNo,
      voucherNo: voucher.voucherNo,
      netPaid: netPaid.toFixed(2),
    }
  })
}

// ---------------------------------------------------------------------------
// Debit notes
// ---------------------------------------------------------------------------

export async function listDebitNotes() {
  const notes = await prisma.debitNote.findMany({
    orderBy: { issuedOn: 'desc' },
    include: { party: true, bill: true },
    take: 100,
  })

  return notes.map((note) => ({
    id: note.id,
    noteNo: note.noteNo,
    vendor: note.party.name,
    billNo: note.bill?.billNo ?? null,
    issuedOn: note.issuedOn.toISOString().slice(0, 10),
    amount: note.amount.toFixed(2),
    reason: note.reason,
  }))
}

/**
 * Reduce a posted bill — row 24.
 *
 *   Dr 2010 Accounts Payable (vendor)
 *   Cr expense account
 *
 * A bill is never edited after posting; this is how a correction is recorded so
 * both the original and the adjustment stay visible.
 */
export async function createDebitNote(input: {
  billId: string
  issuedOn: Date
  amount: string
  reason: string
  createdBy: string
  canPostToSoftClosed: boolean
}) {
  const amount = new Prisma.Decimal(input.amount || 0)
  if (amount.lte(ZERO)) {
    throw new AccountingError('INVALID_LINE', 'Amount must be greater than zero.')
  }
  if (!input.reason.trim()) {
    throw new AccountingError('INVALID_LINE', 'A reason is required.')
  }

  const bill = await prisma.expenseBill.findUnique({
    where: { id: input.billId },
    include: { category: true, party: true },
  })
  if (!bill) throw new AccountingError('INVALID_LINE', 'Bill not found.')
  if (bill.status === 'DRAFT') {
    throw new AccountingError(
      'NOT_POSTED',
      `${bill.billNo} has not been approved — edit the draft instead of raising a debit note.`,
    )
  }

  const settled = (await settledByBill()).get(bill.id) ?? ZERO
  const outstanding = bill.total.sub(settled)
  if (amount.gt(outstanding)) {
    throw new AccountingError(
      'INVALID_LINE',
      `${bill.billNo} has only ${outstanding.toFixed(2)} outstanding.`,
    )
  }

  return prisma.$transaction(async (tx) => {
    // As with payments: the note is the voucher, so it carries that number
    // rather than consuming a second one from the same DN series.
    const voucher = await postEntry(tx, {
      voucherType: 'DN',
      entryDate: input.issuedOn,
      narration: `Debit note against ${bill.billNo}: ${input.reason.trim()}`,
      sourceType: 'DEBIT_NOTE',
      sourceId: bill.id,
      currency: 'BDT',
      fxRate: 1,
      createdBy: input.createdBy,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        {
          accountCode: ACCOUNTS.AP_VENDORS,
          debit: amount.toFixed(2),
          partyId: bill.partyId,
        },
        { accountCode: bill.category.glAccountCode, credit: amount.toFixed(2) },
      ],
    })

    const note = await tx.debitNote.create({
      data: {
        noteNo: voucher.voucherNo,
        partyId: bill.partyId,
        billId: bill.id,
        issuedOn: input.issuedOn,
        amount: amount.toFixed(2),
        reason: input.reason.trim(),
        journalEntryId: voucher.id,
        createdBy: input.createdBy,
      },
    })

    // A note that clears the remaining balance settles the bill.
    if (amount.gte(outstanding)) {
      await tx.expenseBill.update({ where: { id: bill.id }, data: { status: 'PAID' } })
    }

    return { noteNo: note.noteNo, voucherNo: voucher.voucherNo }
  })
}

// ---------------------------------------------------------------------------
// Payables aging
// ---------------------------------------------------------------------------

export type AgingBucket = 'CURRENT' | 'D1_30' | 'D31_60' | 'D61_90' | 'D90_PLUS'

export async function getPayablesAging(asOf: Date) {
  const [bills, settled] = await Promise.all([
    prisma.expenseBill.findMany({
      where: { status: { in: ['APPROVED', 'PARTIALLY_PAID'] } },
      include: { party: true },
    }),
    settledByBill(),
  ])

  const byVendor = new Map<
    string,
    { vendor: string; buckets: Record<AgingBucket, number>; total: number }
  >()

  const empty = (): Record<AgingBucket, number> => ({
    CURRENT: 0,
    D1_30: 0,
    D31_60: 0,
    D61_90: 0,
    D90_PLUS: 0,
  })

  for (const bill of bills) {
    const outstanding = bill.total.sub(settled.get(bill.id) ?? ZERO).toNumber()
    if (outstanding <= 0.005) continue

    // Age from the due date; a bill with no due date ages from when incurred.
    const reference = bill.dueOn ?? bill.incurredOn
    const days = Math.floor((asOf.getTime() - reference.getTime()) / 86_400_000)

    const bucket: AgingBucket =
      days <= 0 ? 'CURRENT' : days <= 30 ? 'D1_30' : days <= 60 ? 'D31_60' : days <= 90 ? 'D61_90' : 'D90_PLUS'

    const entry = byVendor.get(bill.partyId) ?? {
      vendor: bill.party.name,
      buckets: empty(),
      total: 0,
    }
    entry.buckets[bucket] += outstanding
    entry.total += outstanding
    byVendor.set(bill.partyId, entry)
  }

  const rows = [...byVendor.values()]
    .sort((a, b) => b.total - a.total)
    .map((row) => ({
      vendor: row.vendor,
      current: row.buckets.CURRENT.toFixed(2),
      d1_30: row.buckets.D1_30.toFixed(2),
      d31_60: row.buckets.D31_60.toFixed(2),
      d61_90: row.buckets.D61_90.toFixed(2),
      d90plus: row.buckets.D90_PLUS.toFixed(2),
      total: row.total.toFixed(2),
    }))

  const sum = (key: keyof (typeof rows)[number]) =>
    rows.reduce((s, r) => s + Number(r[key]), 0).toFixed(2)

  return {
    asOf: asOf.toISOString().slice(0, 10),
    rows,
    totals: {
      current: sum('current'),
      d1_30: sum('d1_30'),
      d31_60: sum('d31_60'),
      d61_90: sum('d61_90'),
      d90plus: sum('d90plus'),
      total: sum('total'),
    },
  }
}
