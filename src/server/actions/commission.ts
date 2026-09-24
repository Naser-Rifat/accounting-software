'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'

import type { AdjustmentReason, PaymentMethod } from '@/generated/prisma/enums'
import { isAccountingError } from '@/server/accounting/errors'
import { canManageCommission, canPostToSoftClosedPeriod } from '@/server/auth/authorize'
import { requestMeta } from '@/server/auth/request'
import { requireUser } from '@/server/auth/session'
import {
  cancelClaim,
  createClaim,
  removeFromClaim,
  sendClaim,
  setClaimStatus,
  writeOffClaim,
} from '@/server/services/claim-service'
import {
  addAdjustment,
  approveCommission,
  cancelCommission,
  markEligible,
} from '@/server/services/commission-service'
import {
  approveInternalCommission,
  cancelInternalCommission,
  payInternalCommission,
} from '@/server/services/internal-commission-service'
import { recordReceipt } from '@/server/services/receipt-service'

export type ActionState = { error?: string; message?: string }

function fail(error: unknown, fallback: string): ActionState {
  if (isAccountingError(error)) return { error: error.message }
  console.error(fallback, error)
  return { error: fallback }
}

function refresh() {
  revalidatePath('/commission', 'layout')
  revalidatePath('/students', 'layout')
  revalidatePath('/applications', 'layout')
  revalidatePath('/accounting', 'layout')
  revalidatePath('/sales', 'layout')
}

const NOT_ALLOWED = { error: 'Your role cannot change commission records.' }
const text = (fd: FormData, key: string) => String(fd.get(key) ?? '').trim()
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const day = (s: string) => new Date(`${s}T00:00:00.000Z`)
const todayStr = () => new Date().toISOString().slice(0, 10)
const dateOr = (fd: FormData, key: string) => {
  const v = text(fd, key)
  return DATE_RE.test(v) ? day(v) : day(todayStr())
}

async function actorOf(user: { id: string; username: string }) {
  const { ip } = await requestMeta()
  return { id: user.id, username: user.username, ip }
}

// ---------------------------------------------------------------------------
// Commission rows
// ---------------------------------------------------------------------------

export async function submitMarkEligible(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const ids = formData.getAll('ids').map(String).filter(Boolean)
  if (ids.length === 0) return { error: 'Select at least one commission.' }
  try {
    const result = await markEligible({ commissionIds: ids, eligibleOn: dateOr(formData, 'eligibleOn'), actor: await actorOf(user) })
    refresh()
    return { message: `${result.changed} commission(s) marked eligible.` }
  } catch (error) {
    return fail(error, 'Could not update the commissions.')
  }
}

export async function submitApproveCommission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const ids = formData.getAll('ids').map(String).filter(Boolean)
  const single = text(formData, 'commissionId')
  const targets = single ? [single] : ids
  if (targets.length === 0) return { error: 'Select at least one commission.' }
  const approvedOn = dateOr(formData, 'approvedOn')
  const actor = await actorOf(user)
  const vouchers: string[] = []
  try {
    for (const id of targets) {
      const r = await approveCommission({ commissionId: id, approvedOn, actor, canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
      vouchers.push(r.voucherNo)
    }
    refresh()
    return { message: `${vouchers.length} commission(s) approved — revenue recognised on ${vouchers.join(', ')}.` }
  } catch (error) {
    if (vouchers.length) refresh()
    return fail(error, 'Could not approve the commission.')
  }
}

export async function submitCancelCommission(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const reason = text(formData, 'reason')
  if (reason.length < 3) return { error: 'Give a reason.' }
  try {
    const r = await cancelCommission({ commissionId: text(formData, 'commissionId'), reason, cancelledOn: dateOr(formData, 'cancelledOn'), actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: r.reversalNo ? `Cancelled; approval reversed on ${r.reversalNo}.` : 'Cancelled.' }
  } catch (error) {
    return fail(error, 'Could not cancel the commission.')
  }
}

const adjustmentSchema = z.object({
  commissionId: z.string().min(1),
  direction: z.enum(['INCREASE', 'REDUCE']),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Enter an amount'),
  reason: z.enum(['SCHOLARSHIP_REDUCTION', 'PARTIAL_WITHDRAWAL', 'UNIVERSITY_DISPUTE', 'CURRENCY_DIFFERENCE', 'BONUS', 'CORRECTION']),
  note: z.string().trim().max(300).optional(),
})

export async function submitAdjustment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const parsed = adjustmentSchema.safeParse({
    commissionId: text(formData, 'commissionId'),
    direction: text(formData, 'direction'),
    amount: text(formData, 'amount'),
    reason: text(formData, 'reason'),
    note: text(formData, 'note'),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check the adjustment.' }
  try {
    const r = await addAdjustment({
      commissionId: parsed.data.commissionId,
      amount: parsed.data.direction === 'REDUCE' ? `-${parsed.data.amount}` : parsed.data.amount,
      reason: parsed.data.reason as AdjustmentReason,
      note: parsed.data.note || undefined,
      adjustedOn: dateOr(formData, 'adjustedOn'),
      actor: await actorOf(user),
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    refresh()
    return { message: `Adjusted on ${r.voucherNo}; net is now ${r.netAmount}.` }
  } catch (error) {
    return fail(error, 'Could not post the adjustment.')
  }
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export async function submitCreateClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const universityId = text(formData, 'universityId')
  const commissionIds = formData.getAll('commissionIds').map(String).filter(Boolean)
  let id: string
  try {
    const r = await createClaim({ universityId, commissionIds, notes: text(formData, 'notes') || undefined, actor: await actorOf(user) })
    id = r.id
    refresh()
  } catch (error) {
    return fail(error, 'Could not create the claim.')
  }
  redirect(`/commission/claims/${id}`)
}

export async function submitRemoveFromClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  try {
    await removeFromClaim({ claimId: text(formData, 'claimId'), commissionId: text(formData, 'commissionId'), actor: await actorOf(user) })
    refresh()
    return { message: 'Removed from the claim; the commission is approved and billable again.' }
  } catch (error) {
    return fail(error, 'Could not update the claim.')
  }
}

export async function submitSendClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  try {
    const r = await sendClaim({ claimId: text(formData, 'claimId'), claimedOn: dateOr(formData, 'claimedOn'), actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: `${r.claimNo} sent — invoiced on ${r.voucherNo}, due ${r.dueOn}.` }
  } catch (error) {
    return fail(error, 'Could not send the claim.')
  }
}

export async function submitClaimStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const status = text(formData, 'status')
  if (!['ACKNOWLEDGED', 'DISPUTED', 'SENT'].includes(status)) return { error: 'Unknown status.' }
  try {
    await setClaimStatus({ claimId: text(formData, 'claimId'), status: status as 'ACKNOWLEDGED' | 'DISPUTED' | 'SENT', actor: await actorOf(user) })
    refresh()
    return { message: `Claim marked ${status.toLowerCase()}.` }
  } catch (error) {
    return fail(error, 'Could not update the claim.')
  }
}

export async function submitCancelClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const reason = text(formData, 'reason')
  if (reason.length < 3) return { error: 'Give a reason.' }
  try {
    const r = await cancelClaim({ claimId: text(formData, 'claimId'), reason, cancelledOn: dateOr(formData, 'cancelledOn'), actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: r.reversalNo ? `Claim cancelled; invoice reversed on ${r.reversalNo}.` : 'Draft claim cancelled.' }
  } catch (error) {
    return fail(error, 'Could not cancel the claim.')
  }
}

export async function submitWriteOffClaim(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const reason = text(formData, 'reason')
  if (reason.length < 3) return { error: 'Give a reason.' }
  try {
    const r = await writeOffClaim({ claimId: text(formData, 'claimId'), reason, writtenOffOn: dateOr(formData, 'writtenOffOn'), actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: `Written off ${r.badDebt} to bad debt on ${r.voucherNo}.` }
  } catch (error) {
    return fail(error, 'Could not write off the claim.')
  }
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

const METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'MOBILE_BANKING']

/** Allocation inputs are named `alloc-claim-<id>` / `alloc-invoice-<id>`. */
export async function submitReceipt(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED

  const allocations: { claimId?: string; invoiceId?: string; amount: string }[] = []
  for (const [key, value] of formData.entries()) {
    const amount = String(value).trim()
    if (!amount || Number(amount) <= 0) continue
    if (key.startsWith('alloc-claim-')) allocations.push({ claimId: key.slice('alloc-claim-'.length), amount })
    if (key.startsWith('alloc-invoice-')) allocations.push({ invoiceId: key.slice('alloc-invoice-'.length), amount })
  }
  const method = text(formData, 'method')
  if (!METHODS.includes(method)) return { error: 'Choose a payment method.' }

  try {
    const r = await recordReceipt({
      partyId: text(formData, 'partyId'),
      receivedOn: dateOr(formData, 'receivedOn'),
      amount: text(formData, 'amount'),
      withheldTax: text(formData, 'withheldTax') || '0',
      currency: text(formData, 'currency'),
      bankAccountCode: text(formData, 'bankAccountCode'),
      method: method as PaymentMethod,
      reference: text(formData, 'reference') || undefined,
      allocations,
      actor: await actorOf(user),
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    refresh()
    const fx = Number(r.fxDifference)
    return {
      message: `Receipt ${r.receiptNo} posted.${fx ? ` Realised FX ${fx > 0 ? 'gain' : 'loss'} ${Math.abs(fx).toFixed(2)}.` : ''}${Number(r.unallocated) ? ` ${r.unallocated} held as an advance.` : ''}`,
    }
  } catch (error) {
    return fail(error, 'Could not record the receipt.')
  }
}

// ---------------------------------------------------------------------------
// Internal commission
// ---------------------------------------------------------------------------

export async function submitApproveInternal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const ids = formData.getAll('ids').map(String).filter(Boolean)
  const single = text(formData, 'id')
  const targets = single ? [single] : ids
  if (targets.length === 0) return { error: 'Select at least one row.' }
  const actor = await actorOf(user)
  let done = 0
  try {
    for (const id of targets) {
      await approveInternalCommission({ id, actor, canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
      done++
    }
    refresh()
    return { message: `${done} internal commission(s) approved and expensed.` }
  } catch (error) {
    if (done) refresh()
    return fail(error, 'Could not approve the internal commission.')
  }
}

export async function submitPayInternal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const method = text(formData, 'method')
  if (!METHODS.includes(method)) return { error: 'Choose a payment method.' }
  try {
    const r = await payInternalCommission({
      id: text(formData, 'id'),
      paidOn: dateOr(formData, 'paidOn'),
      bankAccountCode: text(formData, 'bankAccountCode'),
      method: method as PaymentMethod,
      withheldTax: text(formData, 'withheldTax') || '0',
      reference: text(formData, 'reference') || undefined,
      actor: await actorOf(user),
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    refresh()
    return { message: `Paid ${r.net} on ${r.voucherNo}.` }
  } catch (error) {
    return fail(error, 'Could not pay the commission.')
  }
}

export async function submitCancelInternal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser()
  if (!canManageCommission(user.role)) return NOT_ALLOWED
  const reason = text(formData, 'reason')
  if (reason.length < 3) return { error: 'Give a reason.' }
  try {
    const r = await cancelInternalCommission({ id: text(formData, 'id'), reason, cancelledOn: dateOr(formData, 'cancelledOn'), actor: await actorOf(user), canPostToSoftClosed: canPostToSoftClosedPeriod(user.role) })
    refresh()
    return { message: r.reversalNo ? `Cancelled; expense reversed on ${r.reversalNo}.` : 'Cancelled.' }
  } catch (error) {
    return fail(error, 'Could not cancel.')
  }
}
