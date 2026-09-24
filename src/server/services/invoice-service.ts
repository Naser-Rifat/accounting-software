import 'server-only'

import { randomUUID } from 'node:crypto'

import { Prisma } from '@/generated/prisma/client'
import type { FeeType, InvoiceStatus, PaymentMethod } from '@/generated/prisma/enums'
import { ACCOUNTS } from '@/server/accounting/accounts'
import { AccountingError } from '@/server/accounting/errors'
import { getBaseCurrency } from '@/server/accounting/fx'
import { allocateNumber, fiscalYearFor } from '@/server/accounting/numbering'
import { postEntry } from '@/server/accounting/post'
import { prisma, type PrismaTransaction } from '@/server/db/client'
import { controlBalances } from '@/server/db/repositories/ledger'
import { recordAudit, type AuditActor } from '@/server/services/audit-service'
import { getTaxCodeAsOf } from '@/server/services/tax-service'

/**
 * Student invoices, credit notes and refunds — docs/modules/06-student-payments.md.
 *
 *   DRAFT -> ISSUED -> PARTIALLY_PAID -> PAID   (CANCELLED by full credit note)
 *
 * The student is a customer behind 1110. Posting happens at ISSUED (row 12:
 * Dr 1110 with the party / Cr 40xx per fee type, plus Cr 2310 for lines that
 * carry an output tax code). Discounts are contra-revenue on 4090 (row 13),
 * never netted into income. An issued invoice is corrected by credit note
 * (rows 17/19); cash goes back only after a credit note, by refund (row 18).
 */

const ZERO = new Prisma.Decimal(0)
const toDay = (d: Date) => d.toISOString().slice(0, 10)

/** docs/modules/06 §Fee types and income accounts. */
export const FEE_ACCOUNTS: Record<FeeType, string> = {
  APPLICATION: ACCOUNTS.SERVICE_FEE_INCOME,
  SERVICE: ACCOUNTS.SERVICE_FEE_INCOME,
  VISA_PROCESSING: ACCOUNTS.VISA_FEE_INCOME,
  COUNSELING: ACCOUNTS.COUNSELING_FEE_INCOME,
  DOCUMENTATION: ACCOUNTS.DOCUMENTATION_FEE_INCOME,
  OTHER: ACCOUNTS.OTHER_INCOME,
}

const INCLUDE = {
  student: { select: { id: true, firstName: true, lastName: true } },
  party: { select: { code: true } },
  application: { select: { id: true, code: true } },
  lines: { orderBy: { seq: 'asc' as const } },
  allocations: { include: { receipt: { select: { id: true, receiptNo: true, receivedOn: true, method: true, reference: true } } } },
  creditNotes: { orderBy: { issuedOn: 'asc' as const } },
} satisfies Prisma.StudentInvoiceInclude

type Row = Prisma.StudentInvoiceGetPayload<{ include: typeof INCLUDE }>

function summarise(i: Row, today = toDay(new Date())) {
  const received = i.allocations.reduce((s, a) => s.add(a.amount), ZERO)
  const credited = i.creditNotes.reduce((s, c) => s.add(c.amount), ZERO)
  const balance = i.total.sub(received).sub(credited)
  const due = i.dueOn ? toDay(i.dueOn) : null
  const overdueDays = due && ['ISSUED', 'PARTIALLY_PAID'].includes(i.status) && due < today ? Math.floor((Date.parse(today) - Date.parse(due)) / 86_400_000) : 0
  return {
    id: i.id,
    invoiceNo: i.invoiceNo,
    studentId: i.student.id,
    student: `${i.student.firstName} ${i.student.lastName}`,
    studentCode: i.party.code,
    applicationId: i.application?.id ?? null,
    applicationCode: i.application?.code ?? null,
    issuedOn: i.issuedOn ? toDay(i.issuedOn) : null,
    dueOn: due,
    subtotal: i.subtotal.toFixed(2),
    discount: i.discount.toFixed(2),
    taxAmount: i.taxAmount.toFixed(2),
    total: i.total.toFixed(2),
    received: received.toFixed(2),
    credited: credited.toFixed(2),
    balance: balance.toFixed(2),
    currency: i.currency,
    status: i.status,
    overdueDays,
    createdAt: toDay(i.createdAt),
  }
}

export type InvoiceRow = ReturnType<typeof summarise>

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function listInvoices(filter: { studentId?: string; status?: InvoiceStatus } = {}) {
  const rows = await prisma.studentInvoice.findMany({
    where: { ...(filter.studentId ? { studentId: filter.studentId } : {}), ...(filter.status ? { status: filter.status } : {}) },
    orderBy: { createdAt: 'desc' },
    include: INCLUDE,
  })
  return rows.map((r) => summarise(r))
}

export async function getInvoice(id: string) {
  const i = await prisma.studentInvoice.findUnique({ where: { id }, include: INCLUDE })
  if (!i) return null
  const vouchers = await prisma.journalEntry.findMany({
    where: { OR: [{ sourceType: 'STUDENT_INVOICE', sourceId: i.id }, { sourceType: 'CREDIT_NOTE', sourceId: { in: i.creditNotes.map((c) => c.id) } }] },
    select: { id: true, voucherNo: true, voucherType: true, entryDate: true, status: true, narration: true },
    orderBy: { entryDate: 'asc' },
  })
  return {
    ...summarise(i),
    partyId: i.partyId,
    notes: i.notes,
    createdBy: i.createdBy,
    journalEntryId: i.journalEntryId,
    lines: i.lines.map((l) => ({ id: l.id, seq: l.seq, feeType: l.feeType, description: l.description, amount: l.amount.toFixed(2), taxCode: l.taxCode, taxAmount: l.taxAmount.toFixed(2) })),
    receipts: i.allocations.map((a) => ({ id: a.id, receiptNo: a.receipt.receiptNo, receivedOn: toDay(a.receipt.receivedOn), method: a.receipt.method, reference: a.receipt.reference, amount: a.amount.toFixed(2) })),
    creditNotes: i.creditNotes.map((c) => ({ id: c.id, noteNo: c.noteNo, issuedOn: toDay(c.issuedOn), amount: c.amount.toFixed(2), reason: c.reason })),
    vouchers: vouchers.map((v) => ({ ...v, entryDate: toDay(v.entryDate) })),
  }
}

export type InvoiceDetail = NonNullable<Awaited<ReturnType<typeof getInvoice>>>

/** Open invoices of a student's party, for receipt allocation. */
export async function listOpenInvoices(partyId: string) {
  const rows = await prisma.studentInvoice.findMany({ where: { partyId, status: { in: ['ISSUED', 'PARTIALLY_PAID'] } }, orderBy: { dueOn: 'asc' }, include: INCLUDE })
  return rows.map((r) => summarise(r))
}

/** Students with their 1110 balance, for the invoice list header and pickers. */
export async function listStudentBalances() {
  const students = await prisma.student.findMany({ where: { isActive: true }, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], select: { id: true, partyId: true, firstName: true, lastName: true, party: { select: { code: true } } } })
  const due = await controlBalances(ACCOUNTS.AR_STUDENTS, students.map((s) => s.partyId), 'DEBIT')
  return students.map((s) => ({ id: s.id, partyId: s.partyId, code: s.party.code, name: `${s.firstName} ${s.lastName}`, due: due.get(s.partyId) ?? '0.00' }))
}

export async function listOutputTaxCodes() {
  const today = new Date()
  const rows = await prisma.taxCode.findMany({ where: { kind: 'OUTPUT_VAT', isActive: true, effectiveFrom: { lte: today }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: today } }] }, orderBy: { code: 'asc' } })
  return rows.map((t) => ({ code: t.code, name: t.name, rate: t.rate.toString() }))
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export type InvoiceLineInput = { feeType: FeeType; description: string; amount: string; taxCode?: string }

/** A DRAFT invoice; tax per line is computed from the code in force today. */
export async function createInvoice(input: {
  studentId: string
  applicationId?: string
  dueOn?: Date
  discount?: string
  notes?: string
  lines: InvoiceLineInput[]
  actor: AuditActor
}) {
  const lines = input.lines.filter((l) => l.description.trim() && Number(l.amount) > 0)
  if (lines.length === 0) throw new AccountingError('VALIDATION', 'An invoice needs at least one line.')
  const discount = new Prisma.Decimal(input.discount || 0)
  if (discount.isNegative()) throw new AccountingError('VALIDATION', 'Discount cannot be negative.')

  return prisma.$transaction(async (tx) => {
    const student = await tx.student.findUnique({ where: { id: input.studentId } })
    if (!student || !student.isActive) throw new AccountingError('VALIDATION', 'Choose an active student.')
    if (input.applicationId) {
      const app = await tx.application.findUnique({ where: { id: input.applicationId } })
      if (!app || app.studentId !== student.id) throw new AccountingError('VALIDATION', 'That application is not this student’s.')
    }
    const today = new Date()
    const priced = []
    let subtotal = ZERO
    let tax = ZERO
    for (const [i, l] of lines.entries()) {
      const amount = new Prisma.Decimal(l.amount)
      let taxAmount = ZERO
      if (l.taxCode) {
        const code = await getTaxCodeAsOf(l.taxCode, today)
        if (!code || code.kind !== 'OUTPUT_VAT') throw new AccountingError('VALIDATION', `Tax code ${l.taxCode} is not an output VAT code in force today.`)
        taxAmount = amount.mul(code.rate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
      }
      subtotal = subtotal.add(amount)
      tax = tax.add(taxAmount)
      priced.push({ seq: i + 1, feeType: l.feeType, description: l.description.trim(), amount, taxCode: l.taxCode || null, taxAmount })
    }
    if (discount.gt(subtotal)) throw new AccountingError('VALIDATION', 'Discount exceeds the subtotal.')
    const total = subtotal.sub(discount).add(tax)

    const fy = await fiscalYearFor(tx, today)
    const number = await allocateNumber(tx, 'INV', fy.id, fy.code)
    const base = await getBaseCurrency(tx)
    const invoice = await tx.studentInvoice.create({
      data: {
        invoiceNo: number.formatted,
        studentId: student.id,
        partyId: student.partyId,
        applicationId: input.applicationId ?? null,
        dueOn: input.dueOn ?? null,
        subtotal,
        discount,
        taxAmount: tax,
        total,
        currency: base,
        notes: input.notes ?? null,
        createdBy: input.actor.username,
        lines: { create: priced },
      },
    })
    await recordAudit(tx, { actor: input.actor, action: 'INVOICE_CREATED', entity: 'StudentInvoice', entityId: invoice.id, after: { invoiceNo: invoice.invoiceNo, student: `${student.firstName} ${student.lastName}`, total: total.toFixed(2), lines: priced.length } })
    return { id: invoice.id, invoiceNo: invoice.invoiceNo, total: total.toFixed(2) }
  })
}

async function lockInvoice(tx: PrismaTransaction, id: string) {
  await tx.$queryRaw`SELECT "id" FROM "StudentInvoice" WHERE "id" = ${id} FOR UPDATE`
  const i = await tx.studentInvoice.findUnique({ where: { id }, include: INCLUDE })
  if (!i) throw new AccountingError('NOT_FOUND', 'Invoice not found.')
  return i
}

/** DRAFT → ISSUED: row 12 (+13 for a discount). */
export async function issueInvoice(input: { invoiceId: string; issuedOn: Date; dueOn?: Date; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const i = await lockInvoice(tx, input.invoiceId)
    if (i.status !== 'DRAFT') throw new AccountingError('ILLEGAL_TRANSITION', 'Only a draft invoice can be issued.')
    if (i.total.lte(ZERO)) throw new AccountingError('VALIDATION', 'The invoice total must be more than zero.')

    const incomeByAccount = new Map<string, Prisma.Decimal>()
    const taxByAccount = new Map<string, Prisma.Decimal>()
    for (const l of i.lines) {
      const acct = FEE_ACCOUNTS[l.feeType]
      incomeByAccount.set(acct, (incomeByAccount.get(acct) ?? ZERO).add(l.amount))
      if (l.taxCode && l.taxAmount.gt(ZERO)) {
        const code = await getTaxCodeAsOf(l.taxCode, input.issuedOn)
        const taxAcct = code?.glAccountCode ?? ACCOUNTS.VAT_PAYABLE
        taxByAccount.set(taxAcct, (taxByAccount.get(taxAcct) ?? ZERO).add(l.taxAmount))
      }
    }
    const dueOn = input.dueOn ?? i.dueOn ?? new Date(input.issuedOn.getTime() + 14 * 86_400_000)

    const voucher = await postEntry(tx, {
      voucherType: 'SI',
      entryDate: input.issuedOn,
      narration: `Invoice ${i.invoiceNo} — ${i.student.firstName} ${i.student.lastName}`,
      sourceType: 'STUDENT_INVOICE',
      sourceId: i.id,
      currency: i.currency,
      fxRate: 1,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: ACCOUNTS.AR_STUDENTS, debit: i.total.toFixed(2), partyId: i.partyId },
        ...(i.discount.gt(ZERO) ? [{ accountCode: ACCOUNTS.REFUNDS_AND_DISCOUNTS, debit: i.discount.toFixed(2), lineNarration: 'Discount' }] : []),
        ...[...incomeByAccount].map(([accountCode, amount]) => ({ accountCode, credit: amount.toFixed(2) })),
        ...[...taxByAccount].map(([accountCode, amount]) => ({ accountCode, credit: amount.toFixed(2), lineNarration: 'Output VAT' })),
      ],
    })
    await tx.studentInvoice.update({ where: { id: i.id }, data: { status: 'ISSUED', issuedOn: input.issuedOn, dueOn, journalEntryId: voucher.id } })
    await recordAudit(tx, { actor: input.actor, action: 'INVOICE_ISSUED', entity: 'StudentInvoice', entityId: i.id, before: { status: 'DRAFT' }, after: { status: 'ISSUED', issuedOn: toDay(input.issuedOn), dueOn: toDay(dueOn), voucherNo: voucher.voucherNo } })
    return { id: i.id, invoiceNo: i.invoiceNo, voucherNo: voucher.voucherNo }
  })
}

export async function deleteDraftInvoice(input: { invoiceId: string; actor: AuditActor }) {
  return prisma.$transaction(async (tx) => {
    const i = await lockInvoice(tx, input.invoiceId)
    if (i.status !== 'DRAFT') throw new AccountingError('ILLEGAL_TRANSITION', 'Only a draft can be deleted; an issued invoice is cancelled by credit note.')
    await tx.studentInvoice.delete({ where: { id: i.id } })
    await recordAudit(tx, { actor: input.actor, action: 'INVOICE_DRAFT_DELETED', entity: 'StudentInvoice', entityId: i.id, before: { invoiceNo: i.invoiceNo, total: i.total.toFixed(2) } })
    return { invoiceNo: i.invoiceNo }
  })
}

/**
 * Credit note against an issued invoice — row 17, Dr 4090 / Cr 1110 (party).
 * A full-value credit note cancels the invoice (row 19). The note IS the CN
 * voucher, so it takes the voucher number.
 */
export async function createCreditNote(input: { invoiceId: string; amount: string; reason: string; issuedOn: Date; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  const amount = new Prisma.Decimal(input.amount || 0)
  if (amount.lte(ZERO)) throw new AccountingError('VALIDATION', 'The credit note must be more than zero.')

  return prisma.$transaction(async (tx) => {
    const i = await lockInvoice(tx, input.invoiceId)
    if (!['ISSUED', 'PARTIALLY_PAID', 'PAID'].includes(i.status)) throw new AccountingError('ILLEGAL_TRANSITION', 'Only an issued invoice can be credited.')
    const credited = i.creditNotes.reduce((s, c) => s.add(c.amount), ZERO)
    if (amount.gt(i.total.sub(credited).add('0.005'))) throw new AccountingError('VALIDATION', `At most ${i.total.sub(credited).toFixed(2)} can still be credited on ${i.invoiceNo}.`)

    const noteId = randomUUID()
    const voucher = await postEntry(tx, {
      voucherType: 'CN',
      entryDate: input.issuedOn,
      narration: `Credit note on ${i.invoiceNo} — ${input.reason}`,
      sourceType: 'CREDIT_NOTE',
      sourceId: noteId,
      currency: i.currency,
      fxRate: 1,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: ACCOUNTS.REFUNDS_AND_DISCOUNTS, debit: amount.toFixed(2) },
        { accountCode: ACCOUNTS.AR_STUDENTS, credit: amount.toFixed(2), partyId: i.partyId },
      ],
    })
    const note = await tx.creditNote.create({
      data: { id: noteId, noteNo: voucher.voucherNo, partyId: i.partyId, invoiceId: i.id, issuedOn: input.issuedOn, amount, reason: input.reason, journalEntryId: voucher.id, createdBy: input.actor.username },
    })

    const received = i.allocations.reduce((s, a) => s.add(a.amount), ZERO)
    const nowCredited = credited.add(amount)
    const status: InvoiceStatus =
      nowCredited.gte(i.total.sub('0.005')) && received.isZero() ? 'CANCELLED' : received.add(nowCredited).gte(i.total.sub('0.005')) ? 'PAID' : i.status === 'PAID' ? 'PAID' : i.status
    await tx.studentInvoice.update({ where: { id: i.id }, data: { status } })
    await recordAudit(tx, { actor: input.actor, action: 'CREDIT_NOTE_ISSUED', entity: 'StudentInvoice', entityId: i.id, after: { noteNo: note.noteNo, amount: amount.toFixed(2), reason: input.reason, status } })
    return { id: note.id, noteNo: note.noteNo, status }
  })
}

export async function listCreditNotes() {
  const rows = await prisma.creditNote.findMany({ orderBy: { issuedOn: 'desc' }, include: { party: { select: { name: true, code: true } }, invoice: { select: { id: true, invoiceNo: true } }, refund: { select: { id: true, status: true } } } })
  return rows.map((c) => ({ id: c.id, noteNo: c.noteNo, party: c.party.name, partyCode: c.party.code, invoiceId: c.invoice?.id ?? null, invoiceNo: c.invoice?.invoiceNo ?? null, issuedOn: toDay(c.issuedOn), amount: c.amount.toFixed(2), reason: c.reason, refundStatus: c.refund?.status ?? null, createdBy: c.createdBy }))
}

// ---------------------------------------------------------------------------
// Refunds — request, approve, pay (row 18: Dr 1110 party / Cr bank)
// ---------------------------------------------------------------------------

export async function requestRefund(input: { creditNoteId: string; amount?: string; reason: string; actor: AuditActor }) {
  return prisma.$transaction(async (tx) => {
    const note = await tx.creditNote.findUnique({ where: { id: input.creditNoteId }, include: { invoice: { select: { studentId: true } }, refund: true } })
    if (!note) throw new AccountingError('NOT_FOUND', 'Credit note not found.')
    if (note.refund) throw new AccountingError('VALIDATION', 'A refund already exists for this credit note.')
    if (!note.invoice) throw new AccountingError('VALIDATION', 'The credit note has no invoice.')
    const amount = new Prisma.Decimal(input.amount || note.amount)
    if (amount.lte(ZERO) || amount.gt(note.amount)) throw new AccountingError('VALIDATION', `Refund must be between 0 and ${note.amount.toFixed(2)}.`)
    const refund = await tx.refund.create({ data: { studentId: note.invoice.studentId, creditNoteId: note.id, amount, reason: input.reason, requestedBy: input.actor.username } })
    await recordAudit(tx, { actor: input.actor, action: 'REFUND_REQUESTED', entity: 'Refund', entityId: refund.id, after: { creditNote: note.noteNo, amount: amount.toFixed(2), reason: input.reason } })
    return { id: refund.id }
  })
}

export async function decideRefund(input: { refundId: string; approve: boolean; actor: AuditActor }) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.refund.findUnique({ where: { id: input.refundId } })
    if (!r) throw new AccountingError('NOT_FOUND', 'Refund not found.')
    if (r.status !== 'REQUESTED') throw new AccountingError('ILLEGAL_TRANSITION', 'This refund has already been decided.')
    if (r.requestedBy === input.actor.username) {
      await recordAudit(prisma, { actor: input.actor, action: 'APPROVAL_SOD_VIOLATION', entity: 'Refund', entityId: r.id, after: { attempted: input.approve ? 'APPROVE' : 'REJECT' } })
      throw new AccountingError('SELF_APPROVAL', 'You requested this refund; someone else must approve it.')
    }
    const status = input.approve ? 'APPROVED' : 'REJECTED'
    await tx.refund.update({ where: { id: r.id }, data: { status, approvedBy: input.actor.username, approvedOn: new Date() } })
    await recordAudit(tx, { actor: input.actor, action: input.approve ? 'REFUND_APPROVED' : 'REFUND_REJECTED', entity: 'Refund', entityId: r.id, before: { status: 'REQUESTED' }, after: { status } })
    return { id: r.id, status }
  })
}

export async function payRefund(input: { refundId: string; paidOn: Date; bankAccountCode: string; method: PaymentMethod; reference?: string; actor: AuditActor; canPostToSoftClosed?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const r = await tx.refund.findUnique({ where: { id: input.refundId }, include: { creditNote: { include: { party: true } }, student: { select: { firstName: true, lastName: true } } } })
    if (!r) throw new AccountingError('NOT_FOUND', 'Refund not found.')
    if (r.status !== 'APPROVED') throw new AccountingError('ILLEGAL_TRANSITION', 'Only an approved refund can be paid.')
    const bank = await tx.bankAccount.findFirst({ where: { glAccountCode: input.bankAccountCode, isActive: true } })
    if (!bank) throw new AccountingError('VALIDATION', 'Choose an active bank or cash account.')

    const base = await getBaseCurrency(tx)
    const voucher = await postEntry(tx, {
      voucherType: 'PV',
      entryDate: input.paidOn,
      narration: `Refund to ${r.student.firstName} ${r.student.lastName} — ${r.creditNote.noteNo}${input.reference ? ` (${input.reference})` : ''}`,
      sourceType: 'PAYMENT',
      sourceId: r.id,
      currency: base,
      fxRate: 1,
      createdBy: input.actor.username,
      canPostToSoftClosed: input.canPostToSoftClosed,
      lines: [
        { accountCode: ACCOUNTS.AR_STUDENTS, debit: r.amount.toFixed(2), partyId: r.creditNote.partyId },
        { accountCode: input.bankAccountCode, credit: r.amount.toFixed(2) },
      ],
    })
    await tx.refund.update({ where: { id: r.id }, data: { status: 'PAID', paidOn: input.paidOn, bankAccountCode: input.bankAccountCode, journalEntryId: voucher.id } })
    if (r.creditNote.invoiceId) {
      const inv = await tx.studentInvoice.findUnique({ where: { id: r.creditNote.invoiceId }, include: INCLUDE })
      if (inv && inv.status === 'CANCELLED') await tx.studentInvoice.update({ where: { id: inv.id }, data: { status: 'REFUNDED' } })
    }
    await recordAudit(tx, { actor: input.actor, action: 'REFUND_PAID', entity: 'Refund', entityId: r.id, before: { status: 'APPROVED' }, after: { status: 'PAID', voucherNo: voucher.voucherNo, amount: r.amount.toFixed(2) } })
    return { id: r.id, voucherNo: voucher.voucherNo }
  })
}

export async function listRefunds() {
  const rows = await prisma.refund.findMany({ orderBy: { createdAt: 'desc' }, include: { student: { select: { id: true, firstName: true, lastName: true } }, creditNote: { select: { noteNo: true, invoice: { select: { invoiceNo: true } } } } } })
  return rows.map((r) => ({ id: r.id, studentId: r.student.id, student: `${r.student.firstName} ${r.student.lastName}`, noteNo: r.creditNote.noteNo, invoiceNo: r.creditNote.invoice?.invoiceNo ?? null, amount: r.amount.toFixed(2), reason: r.reason, status: r.status, requestedBy: r.requestedBy, approvedBy: r.approvedBy, paidOn: r.paidOn ? toDay(r.paidOn) : null, createdAt: toDay(r.createdAt) }))
}
