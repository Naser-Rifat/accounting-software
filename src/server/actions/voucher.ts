'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  approveVoucherSchema,
  journalVoucherSchema,
  rejectVoucherSchema,
  reverseVoucherSchema,
} from '@/lib/validation/voucher'
import { isAccountingError } from '@/server/accounting/errors'
import {
  canApproveVoucher,
  canPostManualJournal,
  canPostToSoftClosedPeriod,
  canReverseVoucher,
} from '@/server/auth/authorize'
import { requireUser } from '@/server/auth/session'
import {
  approveVoucher,
  rejectVoucher,
  reverseVoucher,
  saveManualVoucherDraft,
  submitManualVoucher,
} from '@/server/services/voucher-service'

export type VoucherFormState = { error?: string; ok?: boolean }

/**
 * Submit a manual journal voucher for approval.
 *
 * Hand-entered vouchers do not reach the ledger on one person's say-so; this
 * queues the voucher and a different user approves it (docs/02-status-flows.md).
 *
 * Thin controller: authorize, validate, call one service, revalidate, redirect.
 * All accounting rules live in the engine, which is why this stays short.
 */
export async function createJournalVoucher(
  _prev: VoucherFormState,
  formData: FormData,
): Promise<VoucherFormState> {
  const user = await requireUser()

  if (!canPostManualJournal(user.role)) {
    return { error: 'Your role cannot post journal vouchers.' }
  }

  let payload: unknown
  try {
    payload = JSON.parse(String(formData.get('payload') ?? '{}'))
  } catch {
    return { error: 'Could not read the form data.' }
  }

  const parsed = journalVoucherSchema.safeParse(payload)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the entries and try again.' }
  }

  // Which button was pressed. A draft is parked for the maker; a submission
  // goes to the review queue for someone else to post.
  const asDraft = String(formData.get('intent') ?? '') === 'draft'
  const save = asDraft ? saveManualVoucherDraft : submitManualVoucher

  let voucherId: string
  try {
    const result = await save({
      entryDate: new Date(`${parsed.data.entryDate}T00:00:00.000Z`),
      narration: parsed.data.narration,
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
      lines: parsed.data.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        lineNarration: line.lineNarration ?? null,
      })),
    })
    voucherId = result.id
  } catch (error) {
    // Accounting errors carry a message written for the person entering the
    // voucher; anything else is a genuine fault and must not leak internals.
    if (isAccountingError(error)) return { error: error.message }
    console.error('createJournalVoucher failed', error)
    return {
      error: asDraft
        ? 'Could not save the draft. Please try again.'
        : 'Could not submit the voucher. Please try again.',
    }
  }

  revalidatePath('/accounting')
  revalidatePath('/accounting/vouchers')
  revalidatePath('/accounting/vouchers/review')
  redirect(`/accounting/vouchers/${voucherId}`)
}

export async function reverseVoucherAction(
  _prev: VoucherFormState,
  formData: FormData,
): Promise<VoucherFormState> {
  const user = await requireUser()

  if (!canReverseVoucher(user.role)) {
    return { error: 'Your role cannot reverse vouchers.' }
  }

  const parsed = reverseVoucherSchema.safeParse({
    entryId: formData.get('entryId'),
    reversalDate: formData.get('reversalDate'),
    reason: formData.get('reason'),
  })

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details and try again.' }
  }

  let reversalId: string
  try {
    const result = await reverseVoucher({
      entryId: parsed.data.entryId,
      reversalDate: new Date(`${parsed.data.reversalDate}T00:00:00.000Z`),
      reason: parsed.data.reason,
      createdBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
    reversalId = result.id
  } catch (error) {
    if (isAccountingError(error)) return { error: error.message }
    console.error('reverseVoucherAction failed', error)
    return { error: 'Could not reverse the voucher. Please try again.' }
  }

  revalidatePath('/accounting')
  revalidatePath('/accounting/vouchers')
  redirect(`/accounting/vouchers/${reversalId}`)
}

/**
 * Approve a queued voucher and post it.
 *
 * The role check here is the coarse gate. The refusal that actually implements
 * maker-checker — you cannot approve what you submitted — lives in the engine
 * and in a database trigger, because it must hold whatever calls this.
 */
export async function approveVoucherAction(
  _prev: VoucherFormState,
  formData: FormData,
): Promise<VoucherFormState> {
  const user = await requireUser()

  if (!canApproveVoucher(user.role)) {
    return { error: 'Your role cannot approve vouchers.' }
  }

  const parsed = approveVoucherSchema.safeParse({ entryId: formData.get('entryId') })
  if (!parsed.success) {
    return { error: 'Could not read which voucher to approve.' }
  }

  try {
    await approveVoucher({
      entryId: parsed.data.entryId,
      approvedBy: user.username,
      canPostToSoftClosed: canPostToSoftClosedPeriod(user.role),
    })
  } catch (error) {
    if (isAccountingError(error)) return { error: error.message }
    console.error('approveVoucherAction failed', error)
    return { error: 'Could not approve the voucher. Please try again.' }
  }

  revalidatePath('/accounting')
  revalidatePath('/accounting/vouchers')
  revalidatePath('/accounting/vouchers/review')
  return { ok: true }
}

/** Send a queued voucher back to its maker with a reason. */
export async function rejectVoucherAction(
  _prev: VoucherFormState,
  formData: FormData,
): Promise<VoucherFormState> {
  const user = await requireUser()

  if (!canApproveVoucher(user.role)) {
    return { error: 'Your role cannot review vouchers.' }
  }

  const parsed = rejectVoucherSchema.safeParse({
    entryId: formData.get('entryId'),
    reason: formData.get('reason'),
  })
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Give a reason for sending it back.' }
  }

  try {
    await rejectVoucher({
      entryId: parsed.data.entryId,
      rejectedBy: user.username,
      reason: parsed.data.reason,
    })
  } catch (error) {
    if (isAccountingError(error)) return { error: error.message }
    console.error('rejectVoucherAction failed', error)
    return { error: 'Could not reject the voucher. Please try again.' }
  }

  revalidatePath('/accounting')
  revalidatePath('/accounting/vouchers')
  revalidatePath('/accounting/vouchers/review')
  return { ok: true }
}
