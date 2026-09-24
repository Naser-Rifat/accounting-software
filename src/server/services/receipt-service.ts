import 'server-only'

import { randomUUID } from 'node:crypto'

import { Prisma } from '@/generated/prisma/client'
import type { PaymentMethod } from '@/generated/prisma/enums'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { getBaseCurrency, getRate, toBase } from '@/server/accounting/fx'
import { postEntry } from '@/server/accounting/post'
import { prisma } from '@/server/db/client'
import { recordAudit, type AuditActor } from '@/server/services/audit-service'

/**
 * Receipts — money in, for universities and students alike.
 * docs/modules/05 §Receipts (rows 6–8) and docs/modules/06 (rows 14–15).
 *
 * One receipt, many allocations: each row settles part of a claim or an
 * invoice. The receipt IS the receipt voucher, so it carries the RV number.
 *
 * The voucher is posted in base currency with every line pre-converted,
 * because the lines carry different rates: cash and withheld tax at the
 * receipt-date rate, the receivable relieved at what it was booked at. The
 * difference is realised FX (7100) — never a change to the receivable.
 */

const ZERO = new Prisma.Decimal(0)
const toDay = (d: Date) => d.toISOString().slice(0, 10)

export type ReceiptAllocationInput = { claimId?: string; invoiceId?: string; amount: string }

export async function recordReceipt(input: {
  partyId: string
  receivedOn: Date
  amount: string
  withheldTax?: string
  currency: string
  bankAccountCode: string
  method: PaymentMethod
  reference?: string
  allocations: ReceiptAllocationInput[]
  actor: AuditActor
  canPostToSoftClosed?: boolean
}) {
  const gross = new Prisma.Decimal(input.amount || 0)
  const withheld = new Prisma.Decimal(input.withheldTax || 0)
  if (gross.lte(ZERO)) throw new AccountingError('VALIDATION', 'The receipt must be greater than zero.')
  if (withheld.isNegative() || withheld.gt(gross)) throw new AccountingError('VALIDATION', 'Withheld tax must be between zero and the gross amount.')

  const allocations = input.allocations
    .map((a) => ({ ...a, amount: new Prisma.Decimal(a.amount || 0) }))
    .filter((a) => a.amount.gt(ZERO))
  const allocated = allocations.reduce((s, a) => s.add(a.amount), ZERO)
  if (allocated.gt(gross)) throw new AccountingError('VALIDATION', 'Allocations exceed the receipt amount.')
  const unallocated = gross.sub(allocated)

  return prisma.$transaction(async (tx) => {
    const party = await tx.party.findUnique({ where: { id: input.partyId } })
    if (!party) throw new AccountingError('NOT_FOUND', 'Party not found.')
    if (party.type !== 'UNIVERSITY' && party.type !== 'STUDENT') {
      throw new AccountingError('VALIDATION', 'Receipts are recorded against universities and students.')
    }
    if (party.type === 'STUDENT' && withheld.gt(ZERO)) {
      throw new AccountingError('VALIDATION', 'Students do not withhold tax; only universities do.')
    }
    const bank = await tx.bankAccount.findFirst({ where: { glAccountCode: input.bankAccountCode, isActive: true } })
    if (!bank) throw new AccountingError('VALIDATION', 'Choose an active bank or cash account.')

    const base = await getBaseCurrency(tx)
    const spot = await getRate(tx, input.currency, base, input.receivedOn)

    type Relief = { accountCode: string; partyId: string; base: Prisma.Decimal; narration: string; costCenterId: string | null }
    const reliefs: Relief[] = []
    const allocationRows: { claimId: string | null; invoiceId: string | null; amount: Prisma.Decimal; baseAmount: Prisma.Decimal }[] = []

    for (const a of allocations) {
      if (a.claimId) {
        const claim = await tx.commissionClaim.findUnique({
          where: { id: a.claimId },
          include: { allocations: true, commissions: { take: 1, include: { application: { select: { branch: { select: { costCenterId: true } } } } } } },
        })
        if (!claim || claim.partyId !== party.id) throw new AccountingError('VALIDATION', 'That claim does not belong to this party.')
        if (!['SENT', 'ACKNOWLEDGED', 'PARTIALLY_PAID', 'DISPUTED'].includes(claim.status)) throw new AccountingError('VALIDATION', `Claim ${claim.claimNo} is ${claim.status.toLowerCase()}; it cannot take a receipt.`)
        if (claim.currency !== input.currency) throw new AccountingError('VALIDATION', `Claim ${claim.claimNo} is in ${claim.currency}; the receipt is in ${input.currency}.`)
        const received = claim.allocations.reduce((s, x) => s.add(x.amount), ZERO)
        const balance = claim.totalAmount.sub(received)
        if (a.amount.gt(balance.add('0.005'))) throw new AccountingError('VALIDATION', `Claim ${claim.claimNo} has only ${balance.toFixed(2)} outstanding.`)
        // Relieve the receivable at the booked rate, pro rata.
        const relievedBase = a.amount.gte(balance)
          ? (claim.baseAmount ?? ZERO).sub(claim.allocations.reduce((s, x) => s.add(x.baseAmount), ZERO))
          : toBase(a.amount, claim.fxRate ?? spot)
        reliefs.push({ accountCode: ACCOUNTS.AR_UNIVERSITIES, partyId: party.id, base: relievedBase, narration: claim.claimNo, costCenterId: claim.commissions[0]?.application.branch.costCenterId ?? null })
        allocationRows.push({ claimId: claim.id, invoiceId: null, amount: a.amount, baseAmount: relievedBase })
      } else if (a.invoiceId) {
        const invoice = await tx.studentInvoice.findUnique({ where: { id: a.invoiceId }, include: { allocations: true } })
        if (!invoice || invoice.partyId !== party.id) throw new AccountingError('VALIDATION', 'That invoice does not belong to this party.')
        if (!['ISSUED', 'PARTIALLY_PAID'].includes(invoice.status)) throw new AccountingError('VALIDATION', `Invoice ${invoice.invoiceNo} is ${invoice.status.toLowerCase()}; it cannot take a receipt.`)
        if (invoice.currency !== input.currency) throw new AccountingError('VALIDATION', `Invoice ${invoice.invoiceNo} is in ${invoice.currency}.`)
        const received = invoice.allocations.reduce((s, x) => s.add(x.amount), ZERO)
        const credited = (await tx.creditNote.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } }))._sum.amount ?? ZERO
        const balance = invoice.total.sub(received).sub(credited)
        if (a.amount.gt(balance.add('0.005'))) throw new AccountingError('VALIDATION', `Invoice ${invoice.invoiceNo} has only ${balance.toFixed(2)} outstanding.`)
        const relievedBase = toBase(a.amount, spot) // student invoices are in base currency
        reliefs.push({ accountCode: ACCOUNTS.AR_STUDENTS, partyId: party.id, base: relievedBase, narration: invoice.invoiceNo, costCenterId: null })
        allocationRows.push({ claimId: null, invoiceId: invoice.id, amount: a.amount, baseAmount: relievedBase })
      } else {
        throw new AccountingError('VALIDATION', 'Each allocation needs a claim or an invoice.')
      }
    }

    const cashBase = toBase(gross.sub(withheld), spot)
    const withheldBase = toBase(withheld, spot)
    const advanceBase = toBase(unallocated, spot)
    const relievedTotal = reliefs.reduce((s, r) => s.add(r.base), ZERO)
    const fxDiff = cashBase.add(withheldBase).sub(relievedTotal).sub(advanceBase) // + = gain

    const lines = [
      { accountCode: input.bankAccountCode, debit: cashBase.toFixed(2), lineNarration: input.reference ?? null },
      ...(withheld.gt(ZERO) ? [{ accountCode: ACCOUNTS.WITHHOLDING_TAX_RECEIVABLE, debit: withheldBase.toFixed(2), lineNarration: 'Tax deducted at source' }] : []),
      ...reliefs.filter((r) => r.base.gt(ZERO)).map((r) => ({ accountCode: r.accountCode, credit: r.base.toFixed(2), partyId: r.partyId, costCenterId: r.costCenterId, lineNarration: r.narration })),
      ...(unallocated.gt(ZERO)
        ? [{ accountCode: party.type === 'STUDENT' ? ACCOUNTS.STUDENT_ADVANCES : ACCOUNTS.COMMISSION_IN_ADVANCE, credit: advanceBase.toFixed(2), lineNarration: 'Received in advance' }]
        : []),
      ...(fxDiff.isZero()
        ? []
        : fxDiff.gt(ZERO)
          ? [{ accountCode: ACCOUNTS.FX_REALISED, credit: fxDiff.toFixed(2), lineNarration: 'Realised FX gain' }]
          : [{ accountCode: ACCOUNTS.FX_REALISED, debit: fxDiff.abs().toFixed(2), lineNarration: 'Realised FX loss' }]),
    ]

    // The voucher names its source document, and a posted voucher is immutable —
    // so the receipt's id is fixed before the posting, not backfilled after.
    const receiptId = randomUUID()
    const voucher = await postEntry(tx, {
      voucherType: 'RV',
      entryDate: input.receivedOn,
      narration: `Receipt from ${party.name}${input.reference ? ` (${input.reference})` : ''}`,
      sourceType: 'RECEIPT',
      sourceId: receiptId,
      currency: base,
      fxRate: 1,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines,
    })

    const receipt = await tx.receipt.create({
      data: {
        id: receiptId,
        receiptNo: voucher.voucherNo,
        partyId: party.id,
        receivedOn: input.receivedOn,
        amount: gross,
        withheldTax: withheld,
        currency: input.currency,
        fxRate: spot,
        baseAmount: toBase(gross, spot),
        unallocatedAmount: unallocated,
        bankAccountCode: input.bankAccountCode,
        method: input.method,
        reference: input.reference ?? null,
        journalEntryId: voucher.id,
        createdBy: input.actor.username,
        allocations: { create: allocationRows },
      },
    })

    // Settle the documents.
    for (const row of allocationRows) {
      if (row.claimId) {
        const claim = await tx.commissionClaim.findUniqueOrThrow({ where: { id: row.claimId }, include: { allocations: true } })
        const received = claim.allocations.reduce((s, x) => s.add(x.amount), ZERO)
        const paid = received.gte(claim.totalAmount.sub('0.005'))
        await tx.commissionClaim.update({ where: { id: claim.id }, data: { status: paid ? 'PAID' : 'PARTIALLY_PAID' } })
        await tx.commission.updateMany({
          where: { claimId: claim.id, status: { in: ['CLAIMED', 'PARTIALLY_RECEIVED'] } },
          data: { status: paid ? 'RECEIVED' : 'PARTIALLY_RECEIVED', ...(paid ? { receivedOn: input.receivedOn } : {}) },
        })
      }
      if (row.invoiceId) {
        const invoice = await tx.studentInvoice.findUniqueOrThrow({ where: { id: row.invoiceId }, include: { allocations: true } })
        const received = invoice.allocations.reduce((s, x) => s.add(x.amount), ZERO)
        const credited = (await tx.creditNote.aggregate({ where: { invoiceId: invoice.id }, _sum: { amount: true } }))._sum.amount ?? ZERO
        const paid = received.add(credited).gte(invoice.total.sub('0.005'))
        await tx.studentInvoice.update({ where: { id: invoice.id }, data: { status: paid ? 'PAID' : 'PARTIALLY_PAID' } })
      }
    }

    await recordAudit(tx, {
      actor: input.actor,
      action: 'RECEIPT_RECORDED',
      entity: 'Receipt',
      entityId: receipt.id,
      after: {
        receiptNo: receipt.receiptNo,
        party: party.name,
        amount: gross.toFixed(2),
        currency: input.currency,
        withheldTax: withheld.toFixed(2),
        allocations: allocationRows.length,
        unallocated: unallocated.toFixed(2),
        fxDifference: fxDiff.toFixed(2),
      },
    })
    return { id: receipt.id, receiptNo: receipt.receiptNo, fxDifference: fxDiff.toFixed(2), unallocated: unallocated.toFixed(2) }
  })
}

export async function listReceipts(filter: { partyType?: 'UNIVERSITY' | 'STUDENT'; partyId?: string; from?: Date; to?: Date; method?: PaymentMethod } = {}) {
  const rows = await prisma.receipt.findMany({
    where: {
      ...(filter.partyId ? { partyId: filter.partyId } : {}),
      ...(filter.partyType ? { party: { type: filter.partyType } } : {}),
      ...(filter.method ? { method: filter.method } : {}),
      ...(filter.from || filter.to ? { receivedOn: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    },
    orderBy: [{ receivedOn: 'desc' }, { receiptNo: 'desc' }],
    include: {
      party: { select: { name: true, type: true, code: true } },
      allocations: { include: { claim: { select: { claimNo: true } }, invoice: { select: { invoiceNo: true } } } },
    },
  })
  return rows.map((r) => ({
    id: r.id,
    receiptNo: r.receiptNo,
    partyId: r.partyId,
    party: r.party.name,
    partyType: r.party.type,
    receivedOn: toDay(r.receivedOn),
    amount: r.amount.toFixed(2),
    withheldTax: r.withheldTax.toFixed(2),
    currency: r.currency,
    baseAmount: r.baseAmount.toFixed(2),
    unallocated: r.unallocatedAmount.toFixed(2),
    bankAccountCode: r.bankAccountCode,
    method: r.method,
    reference: r.reference,
    allocations: r.allocations.map((a) => ({ document: a.claim?.claimNo ?? a.invoice?.invoiceNo ?? '—', amount: a.amount.toFixed(2) })),
  }))
}
