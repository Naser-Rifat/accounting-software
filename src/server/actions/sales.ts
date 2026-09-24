'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import type { FeeType, PaymentMethod } from '@/generated/prisma/enums'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageCommission, canPostToSoftClosedPeriod } from '@/server/auth/authorize'
import { requestMeta } from '@/server/auth/request'
import { requireUser } from '@/server/auth/session'
import {
  createCreditNote,
  createInvoice,
  decideRefund,
  deleteDraftInvoice,
  issueInvoice,
  payRefund,
  requestRefund,
  type InvoiceLineInput,
} from '@/server/services/invoice-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh() {
  revalidatePath('/sales', 'layout')
  revalidatePath('/students', 'layout')
  revalidatePath('/accounting', 'layout')
}

const NOT_ALLOWED = { error: 'Your role cannot change sales records.' }
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const dateOr = (fd: FormData, key: string) => (DATE_RE.test(text(fd, key)) ? day(text(fd, key)) : day(new Date().toISOString().slice(0, 10)))
const FEE_TYPES = ['APPLICATION', 'SERVICE', 'VISA_PROCESSING', 'COUNSELING', 'DOCUMENTATION', 'OTHER']
const METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_BANKING']

async function actorOf(user: { id: string; username: string }) {
  const { ip } = await requestMeta()
  return { id: user.id, username: user.username, ip }
}

/** Line inputs are `line-<n>-feeType|description|amount|taxCode`, n = 1..N. */
export async function submitCreateInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED

  const lines: InvoiceLineInput[] = []
  for (let n = 1; n <= 10; n++) {
    const description = text(formData, `line-${n}-description`)
    const amount = text(formData, `line-${n}-amount`)
    const feeType = text(formData, `line-${n}-feeType`)
    if (!description && !amount) continue
    if (!FEE_TYPES.includes(feeType)) return { error: `Line ${n}: choose a fee type.` }
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return { error: `Line ${n}: enter an amount.` }
    lines.push({ feeType: feeType as FeeType, description, amount, taxCode: text(formData, `line-${n}-taxCode`) || undefined })
  }
  const dueOn = text(formData, 'dueOn')
  let id: string
  try {
    const r = await createInvoice({
      studentId: text(formData, 'studentId'),
      applicationId: text(formData, 'applicationId') || undefined,
      dueOn: DATE_RE.test(dueOn) ? day(dueOn) : undefined,
      discount: text(formData, 'discount') || '0',
      notes: text(formData, 'notes') || undefined,
      lines,
      actor: await actorOf(user),
    })
    id = r.id
    refresh()
  } catch (error) {
    return fail(error, 'Could not create the invoice.')
  }
  redirect(`/sales/invoices/${id}`)
}

export async function submitIssueInvoice(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const dueOn = text(formData, 'dueOn')
  try {
    const r = await issueInvoice({ invoiceId: text(formData, 'invoiceId'), issuedOn: dateOr(formData, 'issuedOn'), dueOn: DATE_RE.test(dueOn) ? day(dueOn) : undefined, actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: `${r.invoiceNo} issued on ${r.voucherNo}.` }
  } catch (error) {
    return fail(error, 'Could not issue the invoice.')
  }
}

export async function submitDeleteDraft(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  try {
    await deleteDraftInvoice({ invoiceId: text(formData, 'invoiceId'), actor: await actorOf(user) })
    refresh()
  } catch (error) {
    return fail(error, 'Could not delete the draft.')
  }
  redirect('/sales/invoices')
}

export async function submitCreditNote(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const reason = text(formData, 'reason')
  if (reason.length < 3) return { error: 'Give a reason.' }
  try {
    const r = await createCreditNote({ invoiceId: text(formData, 'invoiceId'), amount: text(formData, 'amount'), reason, issuedOn: dateOr(formData, 'issuedOn'), actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: `Credit note ${r.noteNo} posted; the invoice is now ${r.status.toLowerCase().replace(/_/g, ' ')}.` }
  } catch (error) {
    return fail(error, 'Could not post the credit note.')
  }
}

export async function submitRequestRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const reason = text(formData, 'reason')
  if (reason.length < 3) return { error: 'Give a reason.' }
  try {
    await requestRefund({ creditNoteId: text(formData, 'creditNoteId'), amount: text(formData, 'amount') || undefined, reason, actor: await actorOf(user) })
    refresh()
    return { message: 'Refund requested; it needs approval by someone else before it is paid.' }
  } catch (error) {
    return fail(error, 'Could not request the refund.')
  }
}

export async function submitDecideRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  try {
    const r = await decideRefund({ refundId: text(formData, 'refundId'), approve: text(formData, 'decision') === 'approve', actor: await actorOf(user) })
    refresh()
    return { message: `Refund ${r.status.toLowerCase()}.` }
  } catch (error) {
    return fail(error, 'Could not decide the refund.')
  }
}

export async function submitPayRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const method = text(formData, 'method')
  if (!METHODS.includes(method)) return { error: 'Choose a payment method.' }
  try {
    const r = await payRefund({ refundId: text(formData, 'refundId'), paidOn: dateOr(formData, 'paidOn'), bankAccountCode: text(formData, 'bankAccountCode'), method: method as PaymentMethod, reference: text(formData, 'reference') || undefined, actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: `Refund paid on ${r.voucherNo}.` }
  } catch (error) {
    return fail(error, 'Could not pay the refund.')
  }
}
